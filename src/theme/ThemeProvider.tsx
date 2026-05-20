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
  DEFAULT_THEME_ID,
  getThemeById,
  getThemesByMode,
  isAutoThemeId,
  isCompletePalette,
  isThemeMode,
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

const ThemeContext = createContext<ThemeContextValue | null>(null);
const AUTO_THEME_STORAGE_KEY = "typr.auto-theme-selection";

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

  const pickedTheme = pickRandomTheme(available) ?? getThemeById(DEFAULT_THEME_ID, themes);
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
  if (isAutoThemeId(preferenceId)) {
    return resolveAutoTheme(themes, systemMode);
  }

  return getThemeById(preferenceId, themes);
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
  const [themePreferenceId, setThemePreferenceId] = useState<string>(AUTO_THEME_ID);
  const [resolvedThemeId, setResolvedThemeId] = useState<string>(() =>
    resolveTheme(AUTO_THEME_ID, BUILTIN_THEMES, getSystemThemeMode()).id
  );
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>([]);
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
  }, [customThemes]);

  const setTheme = useCallback((nextThemeId: string) => {
    const normalizedThemeId = nextThemeId;
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
    const theme = getThemeById(resolvedThemeId, availableThemes);

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

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return context;
}
