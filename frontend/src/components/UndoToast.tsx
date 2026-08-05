import { X } from 'lucide-react';
import { useUndoStore } from '../store/undoStore';

export function UndoToast() {
  const { message, isError, pending, undo, dismiss } = useUndoStore();
  if (!message) return null;

  return (
    <div className={`undo-toast${isError ? ' undo-toast--error' : ''}`} role="status" aria-live="polite">
      <span>{message}</span>
      {pending && !isError ? (
        <button type="button" onClick={undo}>
          Undo
        </button>
      ) : (
        <button type="button" className="undo-toast__dismiss" aria-label="Dismiss" onClick={dismiss}>
          <X aria-hidden="true" size={14} />
        </button>
      )}
    </div>
  );
}
