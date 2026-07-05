import { useThemeStore, THEME_NAMES, type ThemeName } from '../../store/themeStore.ts';
import { useUiStore } from '../../store/uiStore.ts';

const THEME_LABELS: Record<ThemeName, string> = {
  blueprint: 'BLPR',
  holotable: 'HOLO',
  terminal: 'TERM',
  graphite: 'GRPH',
};

export function ThemeSwitcher() {
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);
  const busy = useUiStore(s => s.prereqRun !== null);

  return (
    <div className="flex gap-0.5 border border-line-soft rounded overflow-hidden">
      {THEME_NAMES.map(name => (
        <button
          key={name}
          onClick={() => setTheme(name)}
          disabled={busy}
          className={`text-[10px] font-semibold tracking-wide px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            theme === name
              ? 'bg-accent text-canvas'
              : 'bg-panel-2 text-ink-mid hover:text-ink'
          }`}
        >
          {THEME_LABELS[name]}
        </button>
      ))}
    </div>
  );
}
