import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  findMatchingSettingsTabs,
  readStoredSettingsMenuState,
  writeStoredSettingsMenuState,
  type SettingsScrollPositions,
  type SettingsTab
} from "./settingsSheetState";

export interface SettingsSheetController {
  bodyRef: React.RefObject<HTMLDivElement | null>;
  handleBodyScroll: () => void;
  handleTabChange: (tab: SettingsTab) => void;
  handleTabSelect: (tab: SettingsTab) => void;
  isMobileNavOpen: boolean;
  matchingTabs: readonly SettingsTab[];
  saveCurrentScrollPosition: () => void;
  searchQuery: string;
  setIsMobileNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  tab: SettingsTab;
}

export function useSettingsSheetController(options: {
  isOpen: boolean;
  recordingKeybindingId: string | null;
}): SettingsSheetController {
  const [stored] = useState(readStoredSettingsMenuState);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const scrollByTabRef = useRef<SettingsScrollPositions>(stored.scrollByTab);
  const tabRef = useRef<SettingsTab>(stored.tab);
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const [tab, setTab] = useState<SettingsTab>(stored.tab);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const persist = useCallback((nextTab: SettingsTab) => {
    writeStoredSettingsMenuState(
      typeof window === "undefined" ? undefined : window.localStorage,
      nextTab,
      scrollByTabRef.current
    );
  }, []);

  const saveCurrentScrollPosition = useCallback(() => {
    const element = bodyRef.current;
    if (!element) return;
    const currentTab = tabRef.current;
    scrollByTabRef.current = {
      ...scrollByTabRef.current,
      [currentTab]: Math.max(0, Math.round(element.scrollTop))
    };
    persist(currentTab);
  }, [persist]);

  const handleTabChange = useCallback((nextTab: SettingsTab) => {
    if (tabRef.current === nextTab) return;
    saveCurrentScrollPosition();
    setTab(nextTab);
  }, [saveCurrentScrollPosition]);

  const handleTabSelect = useCallback((nextTab: SettingsTab) => {
    handleTabChange(nextTab);
    setIsMobileNavOpen(false);
  }, [handleTabChange]);

  const matchingTabs = useMemo(() => findMatchingSettingsTabs(searchQuery), [searchQuery]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!options.isOpen || !query || matchingTabs.includes(tab)) return;
    const [firstMatch] = matchingTabs;
    if (firstMatch) handleTabChange(firstMatch);
  }, [handleTabChange, matchingTabs, options.isOpen, searchQuery, tab]);

  useEffect(() => {
    tabRef.current = tab;
    persist(tab);
  }, [persist, tab]);

  useEffect(() => {
    if (!options.isOpen) return;
    if (scrollRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollRestoreFrameRef.current);
    }
    scrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = scrollByTabRef.current[tab] ?? 0;
      scrollRestoreFrameRef.current = null;
    });
    return () => {
      if (scrollRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollRestoreFrameRef.current);
        scrollRestoreFrameRef.current = null;
      }
    };
  }, [options.isOpen, tab]);

  useEffect(() => {
    if (!options.isOpen || tab !== "keybindings" || !options.recordingKeybindingId) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(
        `[data-keybinding-recorder="${options.recordingKeybindingId}"]`
      )?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [options.isOpen, options.recordingKeybindingId, tab]);

  return {
    bodyRef,
    handleBodyScroll: saveCurrentScrollPosition,
    handleTabChange,
    handleTabSelect,
    isMobileNavOpen,
    matchingTabs,
    saveCurrentScrollPosition,
    searchQuery,
    setIsMobileNavOpen,
    setSearchQuery,
    tab
  };
}
