/**
 * Lightweight a11y helpers for P4-6 WCAG pass.
 * Pure functions — unit tested; used by interactive controls.
 */

/** True when interactive element has an accessible name (aria-label or non-empty text). */
export function hasAccessibleName(opts: {
  ariaLabel?: string | null;
  textContent?: string | null;
  ariaLabelledBy?: string | null;
}): boolean {
  if (opts.ariaLabel && opts.ariaLabel.trim().length > 0) return true;
  if (opts.ariaLabelledBy && opts.ariaLabelledBy.trim().length > 0) return true;
  if (opts.textContent && opts.textContent.trim().length > 0) return true;
  return false;
}

/** Prefer keyboard-focusable role for custom controls. */
export function interactiveRole(as: 'button' | 'link' | 'menuitem' = 'button'): string {
  return as;
}

/** Focus-ring Tailwind classes applied to interactive components. */
export const FOCUS_RING_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
