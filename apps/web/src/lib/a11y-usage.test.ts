import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Structural evidence that P4-6 helpers are applied to shipped UI (not test-only).
 */
describe('a11y usage in shipped components (P4-6)', () => {
  const root = resolve(__dirname, '..');

  it('Button imports FOCUS_RING_CLASS from a11y helpers', () => {
    const src = readFileSync(resolve(root, 'components/ui/button.tsx'), 'utf8');
    expect(src).toContain("from '@/lib/a11y'");
    expect(src).toContain('FOCUS_RING_CLASS');
  });

  it('BoardSwitcher uses hasAccessibleName + FOCUS_RING_CLASS', () => {
    const src = readFileSync(resolve(root, 'features/board/components/BoardSwitcher.tsx'), 'utf8');
    expect(src).toContain('hasAccessibleName');
    expect(src).toContain('FOCUS_RING_CLASS');
    expect(src).toContain('aria-label');
  });

  it('SprintPage and ApiKeys settings use FOCUS_RING_CLASS on controls', () => {
    const sprint = readFileSync(resolve(root, 'features/sprint/components/SprintPage.tsx'), 'utf8');
    const keys = readFileSync(resolve(root, 'features/auth/pages/api-keys-settings.tsx'), 'utf8');
    expect(sprint).toContain('FOCUS_RING_CLASS');
    expect(sprint).toContain('aria-label');
    expect(keys).toContain('FOCUS_RING_CLASS');
    expect(keys).toContain('Create API key');
  });
});
