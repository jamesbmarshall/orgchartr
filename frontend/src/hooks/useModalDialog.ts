import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Shared behaviour for modal overlays: moves focus into the dialog on open,
 * traps Tab within it, closes on Escape, and restores focus to the previously
 * focused element on close. Attach the returned ref to the overlay element
 * (which should have tabIndex={-1} so it can take focus as a last resort).
 *
 * `onClose` is read through a ref, so callers can pass a closure over current
 * state (e.g. one that ignores Escape while saving) without re-running the effect.
 */
export function useModalDialog(onClose: () => void) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // React's autoFocus (and any effect-driven focus) runs before this effect;
    // only move focus if nothing inside the dialog has claimed it yet.
    if (!overlay.contains(document.activeElement)) {
      const target = overlay.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (target ?? overlay).focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // Keep the event from also closing an outer dialog when they're nested.
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...overlay!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === overlay)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    overlay.addEventListener('keydown', handleKeyDown);
    return () => {
      overlay.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return overlayRef;
}
