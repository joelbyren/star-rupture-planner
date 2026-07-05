import { useThemeStore } from '../../store/themeStore.ts';
import { useUiStore } from '../../store/uiStore.ts';

/** Top-left sidebar toggle; its shape is invented/ported per theme (see mockups). */
export function MenuGlyph() {
  const theme = useThemeStore(s => s.theme);
  const sidebarOpen = useUiStore(s => s.sidebarOpen);
  const toggleSidebar = useUiStore(s => s.toggleSidebar);
  // Sidebar is force-hidden during a prerequisite build; block reopening until done.
  const busy = useUiStore(s => s.prereqRun !== null);

  const label = sidebarOpen ? 'Hide sidebar' : 'Show sidebar';
  const shared = {
    onClick: toggleSidebar,
    disabled: busy,
    title: label,
    'aria-label': label,
  } as const;

  if (theme === 'terminal') {
    return (
      <button {...shared} className="term-glyph disabled:opacity-40 disabled:cursor-not-allowed">
        SRP&#9612;
      </button>
    );
  }

  if (theme === 'holotable') {
    return (
      <button {...shared} className="holo-glyph disabled:opacity-40 disabled:cursor-not-allowed">
        <span className="holo-glyph-dot" />
      </button>
    );
  }

  if (theme === 'graphite') {
    return (
      <button {...shared} className="gr-glyph disabled:opacity-40 disabled:cursor-not-allowed">
        <span />
        <span />
        <span />
      </button>
    );
  }

  return (
    <button {...shared} className="bp-glyph disabled:opacity-40 disabled:cursor-not-allowed">
      <span className="bp-glyph-inner" />
      <span className="bp-glyph-dot" />
    </button>
  );
}
