import { useThemeStore } from '../store/themeStore.ts';

export function ThemeBackdrop() {
  const theme = useThemeStore(s => s.theme);

  if (theme === 'blueprint') {
    return (
      <div className="sr-backdrop" aria-hidden="true">
        <div className="bp-grain" />
        <div className="bp-creases" />
        <div className="bp-vignette" />
      </div>
    );
  }

  if (theme === 'holotable') {
    return (
      <div className="sr-backdrop" aria-hidden="true">
        <div className="holo-space" />
        <div className="holo-stars" />
        <div className="holo-stars2" />
        <div className="holo-floor" />
      </div>
    );
  }

  if (theme === 'graphite') {
    return (
      <>
        <div className="sr-backdrop" aria-hidden="true">
          <div className="gr-wash" />
        </div>
        {/* Paper grain sits above the canvas (not inside the z-index:-1 backdrop)
            so the texture reads across the whole surface; pointer-events:none. */}
        <div className="gr-grain" aria-hidden="true" />
      </>
    );
  }

  return (
    <div className="sr-backdrop" aria-hidden="true">
      <div className="term-glow" />
      <div className="term-flicker" />
      <div className="term-scanlines" />
      <div className="term-vignette" />
    </div>
  );
}
