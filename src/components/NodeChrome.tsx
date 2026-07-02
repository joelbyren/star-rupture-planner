import type { ThemeName } from '../store/themeStore.ts';

/**
 * Per-theme "target" decoration for an end-product item node. Structural base
 * chrome (borders, clip-paths, header bars) lives in CSS on the `.sr-node*`
 * hooks — this only covers the bits that need conditional markup.
 */
export function TargetMark({ theme }: { theme: ThemeName }) {
  if (theme === 'blueprint') {
    return (
      <div className="bp-callout">
        <span className="bp-callout-box">Target Output</span>
      </div>
    );
  }
  if (theme === 'holotable') {
    return (
      <>
        <span className="holo-target-tag">Target Lock</span>
        <span className="holo-reticle tl" />
        <span className="holo-reticle tr" />
        <span className="holo-reticle bl" />
        <span className="holo-reticle br" />
      </>
    );
  }
  return null; // terminal's target treatment is pure CSS (alarm) + an inline cursor in ItemNode
}
