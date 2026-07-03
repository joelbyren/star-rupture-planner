import { useThemeStore } from '../../store/themeStore.ts';
import { useUiStore } from '../../store/uiStore.ts';

/** Top-left sidebar toggle; its shape is invented/ported per theme (see mockups). */
export function MenuGlyph() {
  const theme = useThemeStore(s => s.theme);
  const sidebarOpen = useUiStore(s => s.sidebarOpen);
  const toggleSidebar = useUiStore(s => s.toggleSidebar);

  const label = sidebarOpen ? 'Hide sidebar' : 'Show sidebar';

  if (theme === 'terminal') {
    return (
      <button onClick={toggleSidebar} title={label} aria-label={label} className="term-glyph">
        SRP&#9612;
      </button>
    );
  }

  if (theme === 'holotable') {
    return (
      <button onClick={toggleSidebar} title={label} aria-label={label} className="holo-glyph">
        <span className="holo-glyph-dot" />
      </button>
    );
  }

  if (theme === 'graphite') {
    return (
      <button onClick={toggleSidebar} title={label} aria-label={label} className="gr-glyph">
        <span />
        <span />
        <span />
      </button>
    );
  }

  return (
    <button onClick={toggleSidebar} title={label} aria-label={label} className="bp-glyph">
      <span className="bp-glyph-inner" />
      <span className="bp-glyph-dot" />
    </button>
  );
}
