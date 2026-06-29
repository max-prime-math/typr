import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import {
  applyThemeVariables,
  AUTO_THEME_ID,
  BUILTIN_THEMES,
  createCustomTheme,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_THEME_ID,
  getThemeById,
  getThemesByMode,
  isAutoThemeId,
  isCompletePalette,
  isThemeMode,
  normalizeThemeId,
  pickRandomTheme,
  type ThemeDefinition,
  type ThemeImportFile,
  type ThemeMode
} from "./themes";
import { loadCustomThemes, saveCustomThemes } from "../storage/indexedDbStorage";

interface ThemeContextValue {
  themeId: string;
  theme: ThemeDefinition;
  themes: ThemeDefinition[];
  builtinThemes: ThemeDefinition[];
  customThemes: ThemeDefinition[];
  setTheme: (themeId: string) => void;
  importThemeFile: (
    file: File
  ) => Promise<{ ok: true; theme: ThemeDefinition } | { ok: false; message: string }>;
  removeCustomTheme: (themeId: string) => void;
}

interface AutoThemeSelection {
  systemMode: ThemeMode;
  themeId: string;
}

interface BootThemeSnapshot {
  preferenceId: string;
  resolvedTheme: ThemeDefinition;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const AUTO_THEME_STORAGE_KEY = "typr.auto-theme-selection";
const BOOT_THEME_STORAGE_KEY = "typr.boot-theme";
const CUSTOM_THEMES_STORAGE_KEY = "typr.custom-themes-cache";

function getSystemThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readAutoThemeSelection(): AutoThemeSelection | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(AUTO_THEME_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<AutoThemeSelection>;
    if (parsed.systemMode !== "light" && parsed.systemMode !== "dark") {
      return null;
    }

    if (typeof parsed.themeId !== "string" || parsed.themeId.length === 0) {
      return null;
    }

    return {
      systemMode: parsed.systemMode,
      themeId: parsed.themeId
    };
  } catch {
    return null;
  }
}

function saveAutoThemeSelection(selection: AutoThemeSelection): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTO_THEME_STORAGE_KEY, JSON.stringify(selection));
}

function readBootThemeSnapshot(): BootThemeSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(BOOT_THEME_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<BootThemeSnapshot> & {
      resolvedTheme?: Partial<ThemeDefinition> & { palette?: unknown };
    };
    if (typeof parsed.preferenceId !== "string" || !parsed.preferenceId) {
      return null;
    }

    const resolvedTheme = parsed.resolvedTheme;
    if (
      !resolvedTheme ||
      typeof resolvedTheme.id !== "string" ||
      typeof resolvedTheme.name !== "string" ||
      typeof resolvedTheme.description !== "string" ||
      (resolvedTheme.mode !== "light" && resolvedTheme.mode !== "dark") ||
      (resolvedTheme.source !== "builtin" && resolvedTheme.source !== "custom") ||
      !isCompletePalette(resolvedTheme.palette)
    ) {
      return null;
    }

    return {
      preferenceId: parsed.preferenceId,
      resolvedTheme: {
        id: resolvedTheme.id,
        name: resolvedTheme.name,
        description: resolvedTheme.description,
        mode: resolvedTheme.mode,
        source: resolvedTheme.source,
        palette: resolvedTheme.palette
      }
    };
  } catch {
    return null;
  }
}

function saveBootThemeSnapshot(snapshot: BootThemeSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BOOT_THEME_STORAGE_KEY, JSON.stringify(snapshot));
}

function readCachedCustomThemes(): ThemeDefinition[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is ThemeDefinition => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const candidate = entry as Partial<ThemeDefinition> & { palette?: unknown };
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.description === "string" &&
        (candidate.mode === "light" || candidate.mode === "dark") &&
        (candidate.source === "builtin" || candidate.source === "custom") &&
        isCompletePalette(candidate.palette)
      );
    });
  } catch {
    return [];
  }
}

function saveCachedCustomThemes(themes: ThemeDefinition[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
}

function resolveAutoTheme(
  themes: ThemeDefinition[],
  systemMode: ThemeMode
): ThemeDefinition {
  const available = getThemesByMode(themes, systemMode);
  const storedSelection = readAutoThemeSelection();

  if (storedSelection?.systemMode === systemMode) {
    const storedTheme = available.find(
      (themeDefinition) => themeDefinition.id === storedSelection.themeId
    );

    if (storedTheme) {
      return storedTheme;
    }
  }

  const defaultThemeId = systemMode === "dark" ? DEFAULT_DARK_THEME_ID : DEFAULT_THEME_ID;
  const pickedTheme =
    available.find((themeDefinition) => themeDefinition.id === defaultThemeId) ??
    pickRandomTheme(available) ??
    getThemeById(DEFAULT_THEME_ID, themes);
  saveAutoThemeSelection({
    systemMode,
    themeId: pickedTheme.id
  });
  return pickedTheme;
}

function resolveTheme(
  preferenceId: string,
  themes: ThemeDefinition[],
  systemMode: ThemeMode
): ThemeDefinition {
  const normalizedPreferenceId = normalizeThemeId(preferenceId);

  if (isAutoThemeId(normalizedPreferenceId)) {
    return resolveAutoTheme(themes, systemMode);
  }

  return getThemeById(normalizedPreferenceId, themes);
}

function createThemeFromImportFile(parsed: unknown): ThemeDefinition | null {
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as Partial<ThemeImportFile> & {
    palette?: unknown;
  };

  if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
    return null;
  }

  if (!isThemeMode(candidate.mode)) {
    return null;
  }

  const rawPalette = candidate.colors ?? candidate.palette;
  if (!isCompletePalette(rawPalette)) {
    return null;
  }

  return createCustomTheme(candidate.name.trim(), candidate.mode, rawPalette);
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const bootThemeSnapshotRef = useRef<BootThemeSnapshot | null>(readBootThemeSnapshot());
  const [themePreferenceId, setThemePreferenceId] = useState<string>(
    () => normalizeThemeId(bootThemeSnapshotRef.current?.preferenceId ?? AUTO_THEME_ID)
  );
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>(() => readCachedCustomThemes());
  const [resolvedThemeId, setResolvedThemeId] = useState<string>(() => {
    const bootTheme = bootThemeSnapshotRef.current?.resolvedTheme;

    if (bootTheme) {
      const normalizedBootThemeId = normalizeThemeId(bootTheme.id);
      if (normalizedBootThemeId !== bootTheme.id) {
        return resolveTheme(normalizedBootThemeId, BUILTIN_THEMES, getSystemThemeMode()).id;
      }

      return bootTheme.id;
    }

    return resolveTheme(AUTO_THEME_ID, BUILTIN_THEMES, getSystemThemeMode()).id;
  });
  const [systemThemeMode, setSystemThemeMode] = useState<ThemeMode>(getSystemThemeMode);
  const customThemesRef = useRef(customThemes);
  const systemThemeModeRef = useRef(systemThemeMode);

  useEffect(() => {
    customThemesRef.current = customThemes;
  }, [customThemes]);

  useEffect(() => {
    systemThemeModeRef.current = systemThemeMode;
  }, [systemThemeMode]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCustomThemes() {
      const storedThemes = await loadCustomThemes();

      if (cancelled) {
        return;
      }

      setCustomThemes(storedThemes ?? []);
    }

    void hydrateCustomThemes();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemThemeMode = () => {
      setSystemThemeMode(mediaQuery.matches ? "dark" : "light");
    };

    updateSystemThemeMode();
    mediaQuery.addEventListener("change", updateSystemThemeMode);

    return () => {
      mediaQuery.removeEventListener("change", updateSystemThemeMode);
    };
  }, []);

  useEffect(() => {
    const availableThemes = [...BUILTIN_THEMES, ...customThemes];
    const nextTheme = resolveTheme(themePreferenceId, availableThemes, systemThemeMode);

    if (nextTheme.id !== resolvedThemeId) {
      setResolvedThemeId(nextTheme.id);
    }
  }, [customThemes, resolvedThemeId, systemThemeMode, themePreferenceId]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const availableThemes = [...BUILTIN_THEMES, ...customThemes];
    const theme = getThemeById(resolvedThemeId, availableThemes);
    applyThemeVariables(theme, document.documentElement);
  }, [customThemes, resolvedThemeId]);

  useEffect(() => {
    void saveCustomThemes(customThemes).catch(() => {
      // Ignore persistence failures; the imported theme remains active for this session.
    });
    saveCachedCustomThemes(customThemes);
  }, [customThemes]);

  const setTheme = useCallback((nextThemeId: string) => {
    const normalizedThemeId = normalizeThemeId(nextThemeId);
    setThemePreferenceId(normalizedThemeId);

    const availableThemes = [...BUILTIN_THEMES, ...customThemesRef.current];
    if (isAutoThemeId(normalizedThemeId)) {
      const nextTheme = resolveAutoTheme(availableThemes, systemThemeModeRef.current);
      setResolvedThemeId(nextTheme.id);
      return;
    }

    const nextTheme = getThemeById(normalizedThemeId, availableThemes);
    setResolvedThemeId(nextTheme.id);
  }, []);

  const importThemeFile = useCallback(
    async (
      file: File
    ): Promise<{ ok: true; theme: ThemeDefinition } | { ok: false; message: string }> => {
      let text: string;

      try {
        text = await file.text();
      } catch {
        return {
          ok: false,
          message: "Could not read that file."
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return {
          ok: false,
          message: "Theme files must be valid JSON."
        };
      }

      const importedTheme = createThemeFromImportFile(parsed);
      if (!importedTheme) {
        return {
          ok: false,
          message:
            "Expected a JSON object with name, mode, and a full colors palette."
        };
      }

      setCustomThemes((currentThemes) => {
        const nextThemes = [
          ...currentThemes.filter(
            (themeDefinition) => themeDefinition.name !== importedTheme.name
          ),
          importedTheme
        ];
        return nextThemes;
      });
      setThemePreferenceId(importedTheme.id);
      setResolvedThemeId(importedTheme.id);

      return {
        ok: true,
        theme: importedTheme
      };
    },
    []
  );

  const removeCustomTheme = useCallback((themeToRemoveId: string) => {
    setCustomThemes((currentThemes) => {
      const nextThemes = currentThemes.filter(
        (themeDefinition) => themeDefinition.id !== themeToRemoveId
      );

      if (nextThemes.length === currentThemes.length) {
        return currentThemes;
      }

      setThemePreferenceId((currentPreferenceId) =>
        currentPreferenceId === themeToRemoveId ? AUTO_THEME_ID : currentPreferenceId
      );

      setResolvedThemeId((currentResolvedId) =>
        currentResolvedId === themeToRemoveId ? resolveAutoTheme([...BUILTIN_THEMES, ...nextThemes], systemThemeModeRef.current).id : currentResolvedId
      );

      return nextThemes;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const availableThemes = [...BUILTIN_THEMES, ...customThemes];
    const bootTheme = bootThemeSnapshotRef.current?.resolvedTheme;
    const theme =
      availableThemes.find((themeDefinition) => themeDefinition.id === resolvedThemeId) ??
      (bootTheme?.id === resolvedThemeId ? bootTheme : getThemeById(resolvedThemeId, availableThemes));

    return {
      themeId: theme.id,
      theme,
      themes: availableThemes,
      builtinThemes: BUILTIN_THEMES,
      customThemes,
      setTheme,
      importThemeFile,
      removeCustomTheme
    };
  }, [customThemes, importThemeFile, removeCustomTheme, resolvedThemeId, setTheme]);

  useEffect(() => {
    const availableThemes = [...BUILTIN_THEMES, ...customThemes];
    const bootTheme = bootThemeSnapshotRef.current?.resolvedTheme;
    const theme =
      availableThemes.find((themeDefinition) => themeDefinition.id === resolvedThemeId) ??
      (bootTheme?.id === resolvedThemeId ? bootTheme : getThemeById(resolvedThemeId, availableThemes));

    const snapshot = {
      preferenceId: themePreferenceId,
      resolvedTheme: theme
    };
    bootThemeSnapshotRef.current = snapshot;
    saveBootThemeSnapshot(snapshot);
  }, [customThemes, resolvedThemeId, themePreferenceId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return context;
}
