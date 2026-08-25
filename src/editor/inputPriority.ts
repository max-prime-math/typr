export const EDITOR_INPUT_QUIET_WINDOW_MS = 180;

let lastEditorInputAt = Number.NEGATIVE_INFINITY;
const inputActivityListeners = new Set<() => void>();

export function markEditorInputActivity(now = getNow()): void {
  lastEditorInputAt = now;

  for (const listener of inputActivityListeners) {
    try {
      listener();
    } catch {
      // Input must never wait for optional background-work cleanup.
    }
  }
}

export function subscribeToEditorInputActivity(listener: () => void): () => void {
  inputActivityListeners.add(listener);
  return () => inputActivityListeners.delete(listener);
}

export function getEditorInputWaitMs(now = getNow()): number {
  return getInputPriorityWaitMs(lastEditorInputAt, now, hasPendingBrowserInput());
}

export function waitForEditorInputIdle(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const waitUntilQuiet = () => {
      const waitMs = getEditorInputWaitMs();

      if (waitMs > 0) {
        window.setTimeout(waitUntilQuiet, waitMs);
        return;
      }

      resolve();
    };

    waitUntilQuiet();
  });
}

export function getInputPriorityWaitMs(
  lastInputAt: number,
  now: number,
  browserHasPendingInput = false,
  quietWindowMs = EDITOR_INPUT_QUIET_WINDOW_MS
): number {
  const quietWindowWait = Number.isFinite(lastInputAt)
    ? Math.max(0, quietWindowMs - Math.max(0, now - lastInputAt))
    : 0;

  return browserHasPendingInput
    ? Math.max(quietWindowWait, quietWindowMs)
    : quietWindowWait;
}

function hasPendingBrowserInput(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const scheduling = (navigator as Navigator & {
    scheduling?: { isInputPending?: () => boolean };
  }).scheduling;

  try {
    return scheduling?.isInputPending?.() === true;
  } catch {
    return false;
  }
}

function getNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
