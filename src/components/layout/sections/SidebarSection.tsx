import type { ReactNode } from 'react';

export function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3 py-3 border-b border-line-soft">
      <h3 className="text-[10px] font-semibold tracking-[0.2em] uppercase text-ink-dim mb-2">{title}</h3>
      {children}
    </div>
  );
}

export function SidebarButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded border transition-colors text-left ${
        danger
          ? 'border-danger/40 text-danger hover:bg-danger/10'
          : 'border-line-soft text-ink-mid hover:text-ink hover:bg-panel-2'
      }`}
    >
      {children}
    </button>
  );
}
