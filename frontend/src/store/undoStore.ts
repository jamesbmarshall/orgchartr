import { create } from 'zustand';

interface PendingAction {
  id: string;
  onCommit: () => Promise<void> | void;
  onUndo?: () => void;
  timer: ReturnType<typeof setTimeout>;
}

interface UndoState {
  pending: PendingAction | null;
  message: string | null;
  isError: boolean;
  /**
   * Schedules `onCommit` to run after a short delay, showing an "Undo" toast in the meantime.
   * If another delete is scheduled before this one commits, this one commits immediately
   * (it is no longer undoable). If `onCommit` throws, an error toast is shown instead.
   */
  scheduleDelete: (message: string, onCommit: () => Promise<void> | void, onUndo?: () => void) => void;
  undo: () => void;
  dismiss: () => void;
}

const DELAY_MS = 6000;
const ERROR_DISPLAY_MS = 6000;

export const useUndoStore = create<UndoState>((set, get) => {
  function commitNow(action: PendingAction) {
    Promise.resolve()
      .then(() => action.onCommit())
      .then(() => {
        set((state) => (state.pending?.id === action.id ? { pending: null, message: null, isError: false } : state));
      })
      .catch((err) => {
        set({
          pending: null,
          message: err instanceof Error ? err.message : 'Something went wrong.',
          isError: true,
        });
        setTimeout(() => {
          set((state) => (state.isError ? { message: null, isError: false } : state));
        }, ERROR_DISPLAY_MS);
      });
  }

  return {
    pending: null,
    message: null,
    isError: false,
    scheduleDelete: (message, onCommit, onUndo) => {
      const current = get().pending;
      if (current) {
        clearTimeout(current.timer);
        commitNow(current);
      }
      const id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        const action = get().pending;
        if (action?.id === id) commitNow(action);
      }, DELAY_MS);
      set({ pending: { id, onCommit, onUndo, timer }, message, isError: false });
    },
    undo: () => {
      const current = get().pending;
      if (!current) return;
      clearTimeout(current.timer);
      current.onUndo?.();
      set({ pending: null, message: null, isError: false });
    },
    dismiss: () => set({ message: null, isError: false }),
  };
});
