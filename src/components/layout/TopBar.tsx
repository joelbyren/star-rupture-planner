import { version } from '../../../package.json';
import { MenuGlyph } from './MenuGlyph.tsx';
import { Breadcrumb } from './Breadcrumb.tsx';
import { ThemeSwitcher } from './ThemeSwitcher.tsx';

export function TopBar() {
  return (
    <div className="sr-topbar relative flex items-center gap-3 px-3 py-1.5 border-b border-line-soft bg-panel">
      <MenuGlyph />

      <div className="flex flex-col leading-none">
        <span className="sr-topbar-title font-disp font-semibold text-sm tracking-wide text-ink">StarRupture Planner</span>
        <span className="text-[9px] tracking-[0.25em] uppercase text-ink-dim mt-0.5">orbital base</span>
      </div>

      <div className="flex-1 flex justify-center min-w-0">
        <Breadcrumb />
      </div>

      <div className="flex items-center gap-3">
        <ThemeSwitcher />
        <span className="text-ink-dim text-xs tabular-nums">v{version}</span>
      </div>
    </div>
  );
}
