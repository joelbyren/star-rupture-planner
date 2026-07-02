import { create } from 'zustand';

export type ThemeName = 'blueprint' | 'holotable' | 'terminal';

const THEMES: ThemeName[] = ['blueprint', 'holotable', 'terminal'];
const STORAGE_KEY = 'srp.theme';

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && (THEMES as string[]).includes(value);
}

function pickInitialTheme(): ThemeName {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isThemeName(stored)) return stored;
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
}

interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

// Resolved and applied at module load, before first paint, to avoid a flash
// of the wrong theme — only an explicit choice is persisted, never the
// random fallback pick.
const initialTheme = pickInitialTheme();
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>(set => ({
  theme: initialTheme,
  setTheme: theme => {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
}));

export const THEME_NAMES = THEMES;
