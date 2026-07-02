import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal.tsx';
import { usePlanStore, isNoteNode } from '../store/planStore.ts';
import { useUiStore } from '../store/uiStore.ts';

export function NoteDialog() {
  const noteDialog = useUiStore(s => s.noteDialog);
  const closeNoteDialog = useUiStore(s => s.closeNoteDialog);
  const nodes = usePlanStore(s => s.nodes);
  const addNote = usePlanStore(s => s.addNote);
  const updateNoteText = usePlanStore(s => s.updateNoteText);
  const removeNode = usePlanStore(s => s.removeNode);

  const editing = noteDialog?.mode === 'edit'
    ? nodes.find(n => n.id === noteDialog.noteId && isNoteNode(n))
    : undefined;
  const [text, setText] = useState('');

  useEffect(() => {
    if (!noteDialog) return;
    setText(noteDialog.mode === 'edit' && editing && isNoteNode(editing) ? editing.data.text : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteDialog]);

  if (!noteDialog) return <Modal open={false} onClose={closeNoteDialog}><span /></Modal>;

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (noteDialog.mode === 'create') addNote(noteDialog.parentId, trimmed);
    else updateNoteText(noteDialog.noteId, trimmed);
    closeNoteDialog();
  };

  return (
    <Modal open title={noteDialog.mode === 'create' ? 'Add note' : 'Edit note'} onClose={closeNoteDialog}>
      <div className="space-y-3">
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          placeholder="Write a note…"
          className="w-full bg-panel-2 border border-line-soft rounded text-sm text-ink px-2 py-1.5 resize-none"
        />
        <div className="flex justify-between gap-2 pt-1">
          {noteDialog.mode === 'edit' ? (
            <button
              onClick={() => { removeNode(noteDialog.noteId); closeNoteDialog(); }}
              className="px-3 py-1.5 text-sm rounded bg-danger/80 text-canvas hover:bg-danger"
            >
              Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button
              onClick={closeNoteDialog}
              className="px-3 py-1.5 text-sm rounded bg-panel-2 text-ink-mid hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="px-3 py-1.5 text-sm rounded bg-accent text-canvas hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
