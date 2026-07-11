import { describe, it, expect } from 'vitest';
import { hasAccessibleName, interactiveRole, FOCUS_RING_CLASS } from './a11y';

describe('a11y helpers (P4-6)', () => {
  it('hasAccessibleName requires label or text', () => {
    expect(hasAccessibleName({})).toBe(false);
    expect(hasAccessibleName({ ariaLabel: 'Close' })).toBe(true);
    expect(hasAccessibleName({ textContent: 'Save' })).toBe(true);
    expect(hasAccessibleName({ ariaLabel: '   ' })).toBe(false);
  });

  it('interactiveRole returns requested role', () => {
    expect(interactiveRole('button')).toBe('button');
    expect(interactiveRole('link')).toBe('link');
  });

  it('FOCUS_RING_CLASS includes focus-visible ring', () => {
    expect(FOCUS_RING_CLASS).toContain('focus-visible:ring-2');
  });
});
