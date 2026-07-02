import { create } from 'zustand';

const SIDEBAR_STORAGE_KEY = 'srp.sidebar';

function initialSidebarOpen(): boolean {
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  return stored === null ? true : stored === '1';
}

interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  /** Id of the node currently under the pointer, or null. Derived UI-only state — never written into planStore. */
  hoveredNodeId: string | null;
  setHoveredNode: (id: string | null) => void;
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
}));
