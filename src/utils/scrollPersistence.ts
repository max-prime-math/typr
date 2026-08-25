import { useLayoutEffect, type RefObject } from "react";
import { getEditorInputWaitMs } from "../editor/inputPriority";

const SCROLL_POSITION_STORAGE_KEY = "typr.scroll-positions.v1";
const MAX_STORED_SCROLL_POSITIONS = 250;
const SCROLL_SAVE_DELAY_MS = 120;
const SCROLL_RESTORE_SETTLE_MS = 750;

export interface PersistentScrollPosition {
  left: number;
  top: number;
  updatedAt: number;
}

type ScrollPositionMap = Record<string, PersistentScrollPosition>;

function normalizeCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

export function normalizeStoredScrollPositions(value: unknown): ScrollPositionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const positions: ScrollPositionMap = {};

  for (const [key, candidate] of Object.entries(value)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const position = candidate as Partial<PersistentScrollPosition>;
    const left = normalizeCoordinate(position.left);
    const top = normalizeCoordinate(position.top);
    const updatedAt = normalizeCoordinate(position.updatedAt);

    if (!key || left === null || top === null) {
      continue;
    }

    positions[key] = {
      left,
      top,
      updatedAt: updatedAt ?? 0
    };
  }

  return positions;
}

function readStoredScrollPositions(): ScrollPositionMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return normalizeStoredScrollPositions(
      JSON.parse(window.localStorage.getItem(SCROLL_POSITION_STORAGE_KEY) ?? "null")
    );
  } catch {
    return {};
  }
}

export function readPersistentScrollPosition(key: string | undefined): PersistentScrollPosition | null {
  if (!key) {
    return null;
  }

  return readStoredScrollPositions()[key] ?? null;
}

export function writePersistentScrollPosition(
  key: string | undefined,
  position: Pick<PersistentScrollPosition, "left" | "top">,
  now: number = Date.now()
): void {
  if (!key || typeof window === "undefined") {
    return;
  }

  const left = normalizeCoordinate(position.left);
  const top = normalizeCoordinate(position.top);

  if (left === null || top === null) {
    return;
  }

  try {
    const positions = readStoredScrollPositions();
    positions[key] = { left, top, updatedAt: now };

    const entries = Object.entries(positions);
    if (entries.length > MAX_STORED_SCROLL_POSITIONS) {
      entries
        .sort(([, leftPosition], [, rightPosition]) =>
          rightPosition.updatedAt - leftPosition.updatedAt
        )
        .slice(MAX_STORED_SCROLL_POSITIONS)
        .forEach(([staleKey]) => {
          delete positions[staleKey];
        });
    }

    window.localStorage.setItem(SCROLL_POSITION_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Scroll persistence should never make the editor or preview unavailable.
  }
}

export function attachPersistentScrollPosition(
  element: HTMLElement,
  key: string | undefined,
  options?: { restore?: boolean }
): () => void {
  if (!key || typeof window === "undefined") {
    return () => undefined;
  }

  const storedPosition = options?.restore === false
    ? null
    : readPersistentScrollPosition(key);
  let restorePending = storedPosition !== null;
  let userInteracted = false;
  let saveTimeout: number | null = null;
  let restoreFrame: number | null = null;
  let restoreSettleTimeout: number | null = null;
  let mutationObserver: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const stopRestoring = () => {
    restorePending = false;
    mutationObserver?.disconnect();
    mutationObserver = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (restoreFrame !== null) {
      window.cancelAnimationFrame(restoreFrame);
      restoreFrame = null;
    }
    if (restoreSettleTimeout !== null) {
      window.clearTimeout(restoreSettleTimeout);
      restoreSettleTimeout = null;
    }
  };

  const save = () => {
    if (restorePending && !userInteracted) {
      return;
    }

    if (saveTimeout !== null) {
      window.clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    writePersistentScrollPosition(key, {
      left: element.scrollLeft,
      top: element.scrollTop
    });
  };

  const scheduleSave = () => {
    if (restorePending && !userInteracted) {
      scheduleRestore();
      return;
    }

    if (saveTimeout !== null) {
      window.clearTimeout(saveTimeout);
    }
    saveTimeout = window.setTimeout(save, SCROLL_SAVE_DELAY_MS);
  };

  const scheduleRestore = () => {
    if (!restorePending || !storedPosition || restoreFrame !== null) {
      return;
    }

    if (restoreSettleTimeout !== null) {
      window.clearTimeout(restoreSettleTimeout);
      restoreSettleTimeout = null;
    }

    restoreFrame = window.requestAnimationFrame(() => {
      restoreFrame = null;
      if (!restorePending || userInteracted) {
        return;
      }

      const inputWaitMs = getEditorInputWaitMs();
      if (inputWaitMs > 0) {
        restoreSettleTimeout = window.setTimeout(() => {
          restoreSettleTimeout = null;
          scheduleRestore();
        }, inputWaitMs);
        return;
      }

      const maximumLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      const maximumTop = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollLeft = Math.min(storedPosition.left, maximumLeft);
      element.scrollTop = Math.min(storedPosition.top, maximumTop);

      const horizontalReady = storedPosition.left <= maximumLeft + 1;
      const verticalReady = storedPosition.top <= maximumTop + 1;
      if (horizontalReady && verticalReady) {
        restoreSettleTimeout = window.setTimeout(
          stopRestoring,
          SCROLL_RESTORE_SETTLE_MS
        );
      }
    });
  };

  const handleUserInteraction = () => {
    userInteracted = true;
    stopRestoring();
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      save();
    }
  };

  element.addEventListener("scroll", scheduleSave, { passive: true });
  element.addEventListener("wheel", handleUserInteraction, { passive: true });
  element.addEventListener("touchstart", handleUserInteraction, { passive: true });
  element.addEventListener("pointerdown", handleUserInteraction, { passive: true });
  element.addEventListener("keydown", handleUserInteraction);
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  if (restorePending) {
    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(scheduleRestore);
      mutationObserver.observe(element, {
        attributes: true,
        childList: true,
        subtree: true
      });
    }

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleRestore);
      resizeObserver.observe(element);
      if (element.firstElementChild) {
        resizeObserver.observe(element.firstElementChild);
      }
    }

    scheduleRestore();
  }

  return () => {
    if (!restorePending || userInteracted) {
      save();
    }
    stopRestoring();
    if (saveTimeout !== null) {
      window.clearTimeout(saveTimeout);
    }
    element.removeEventListener("scroll", scheduleSave);
    element.removeEventListener("wheel", handleUserInteraction);
    element.removeEventListener("touchstart", handleUserInteraction);
    element.removeEventListener("pointerdown", handleUserInteraction);
    element.removeEventListener("keydown", handleUserInteraction);
    window.removeEventListener("pagehide", save);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

export function usePersistentScrollPosition(
  ref: RefObject<HTMLElement | null>,
  key: string | undefined
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    return element ? attachPersistentScrollPosition(element, key) : undefined;
  }, [key, ref]);
}
