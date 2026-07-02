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

  return (
    <div className="sr-backdrop" aria-hidden="true">
      <div className="term-glow" />
      <div className="term-flicker" />
      <div className="term-scanlines" />
      <div className="term-vignette" />
    </div>
  );
}
