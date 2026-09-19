import { useEffect, useRef } from 'react';

/**
 * Keyboard and focus behaviour every modal dialog needs:
 *  - focus moves into the dialog when it opens (first focusable element),
 *  - Tab / Shift+Tab stay inside it,
 *  - Escape closes it,
 *  - the page behind stops scrolling,
 *  - on close, focus goes back to whatever opened it (e.g. the card that was clicked).
 * Attach `ref` to the dialog element. `returnFocusTo` (an element) says explicitly where focus
 * goes back to: browsers that don't focus an element on click (Safari) would otherwise leave
 * nothing to restore, so the opener passes itself.
 */
export function useModalA11y(ref, onClose, returnFocusTo) {
  const closeRef = useRef(onClose);
  const returnRef = useRef(returnFocusTo);
  useEffect(() => { closeRef.current = onClose; returnRef.current = returnFocusTo; });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;

    const opener = document.activeElement;
    const focusable = () => [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];

    (focusable()[0] || dialog).focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      const target = returnRef.current?.isConnected ? returnRef.current : opener;
      if (target && typeof target.focus === 'function') target.focus();
    };
  }, [ref]);
}
