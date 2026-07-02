import { create } from 'zustand';

const SIDEBAR_STORAGE_KEY = 'srp.sidebar';

function initialSidebarOpen(): boolean {
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  return stored === null ? true : stored === '1';
}

/** Note dialog: creating a new note on a parent node, or editing/deleting an existing one. */
export type NoteDialogState = { mode: 'create'; parentId: string } | { mode: 'edit'; noteId: string } | null;

interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  /** Id of the node currently under the pointer, or null. Derived UI-only state — never written into planStore. */
  hoveredNodeId: string | null;
  setHoveredNode: (id: string | null) => void;
  noteDialog: NoteDialogState;
  openNoteDialogCreate: (parentId: string) => void;
  openNoteDialogEdit: (noteId: string) => void;
  closeNoteDialog: () => void;
}

export const useUiStore = create<UiState>(set => ({
  sidebarOpen: initialSidebarOpen(),
  toggleSidebar: () =>
    set(state => {
      const next = !state.sidebarOpen;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      return { sidebarOpen: next };
    }),
  hoveredNodeId: null,
  setHoveredNode: id => set({ hoveredNodeId: id }),
  noteDialog: null,
  openNoteDialogCreate: parentId => set({ noteDialog: { mode: 'create', parentId } }),
  openNoteDialogEdit: noteId => set({ noteDialog: { mode: 'edit', noteId } }),
  closeNoteDialog: () => set({ noteDialog: null }),
}));
