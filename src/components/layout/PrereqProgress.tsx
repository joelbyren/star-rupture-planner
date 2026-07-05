import { useUiStore } from '../../store/uiStore.ts';

/** Replaces the breadcrumb while a prerequisite build is running. */
export function PrereqProgress() {
  const run = useUiStore(s => s.prereqRun);
  if (!run) return null;

  const pct = run.total === 0 ? 100 : Math.round((run.done / run.total) * 100);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs text-ink-mid whitespace-nowrap tabular-nums">
        Adding nodes… {run.done}/{run.total}
      </span>
      <div className="w-40 h-1.5 rounded bg-panel-2 border border-line-soft overflow-hidden">
        <div className="h-full bg-accent transition-all duration-150" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
