import type { NodeProps } from '@xyflow/react';
import type { NoteNodeType } from '../store/planStore.ts';
import { useThemeStore } from '../store/themeStore.ts';

/** A "scribble" note pinned to a parent item node. Position is parent-relative (RF `parentId`). */
export function NoteNode({ data }: NodeProps<NoteNodeType>) {
  const theme = useThemeStore(s => s.theme);

  return (
    <div className="sr-note" style={{ maxWidth: 200 }}>
      {theme === 'terminal' && <span className="sr-note-prefix">* REM: </span>}
      <span className="sr-note-text">{data.text}</span>
      {theme === 'holotable' && <span className="sr-note-dot" />}
    </div>
  );
}
