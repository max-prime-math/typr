export interface DesmosGraphingCalculator {
  destroy(): void;
  getExpressions(): unknown[];
  getState(): unknown;
  graphpaperBounds?: {
    mathCoordinates?: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    };
  };
  screenshot(options?: {
    width?: number;
    height?: number;
    targetPixelRatio?: number;
  }): string;
  setBlank(options?: {
    allowUndo?: boolean;
  }): void;
  setState(state: unknown, options?: { allowUndo?: boolean }): void;
  observeEvent(event: string, callback: () => void): void;
  unobserveEvent(event: string, callback?: () => void): void;
}

export interface DesmosNamespace {
  GraphingCalculator: (
    container: HTMLElement,
    options?: {
      autosize?: boolean;
      border?: boolean;
      expressions?: boolean;
      keypad?: boolean;
      settingsMenu?: boolean;
      zoomButtons?: boolean;
    }
  ) => DesmosGraphingCalculator;
}

declare global {
  interface Window {
    Desmos?: DesmosNamespace;
  }
}

const DESMOS_SCRIPT_ID = "typr-desmos-calculator";
let scriptLoadPromise: Promise<void> | null = null;
let loadedApiKey: string | null = null;

export function loadDesmosCalculator(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Desmos requires a browser environment."));
  }

  if (window.Desmos?.GraphingCalculator && loadedApiKey === apiKey) {
    return Promise.resolve();
  }

  if (!apiKey.trim()) {
    return Promise.reject(new Error("Enter a Desmos API key to load the graph editor."));
  }

  if (scriptLoadPromise && loadedApiKey === apiKey) {
    return scriptLoadPromise;
  }

  loadedApiKey = apiKey;
  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(DESMOS_SCRIPT_ID);

    if (existing) {
      existing.remove();
    }

    const script = document.createElement("script");
    script.id = DESMOS_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.desmos.com/api/v1.12/calculator.js?apiKey=${encodeURIComponent(
      apiKey
    )}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load the Desmos calculator script."));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}
