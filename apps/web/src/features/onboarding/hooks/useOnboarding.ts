import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'flow-desk.onboardingComplete';

function readFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeFlag(complete: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (complete) {
      window.localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* localStorage unavailable — silently noop */
  }
}

/**
 * Onboarding state hook.
 *
 * `show` is true when:
 *   - the localStorage flag is unset/false, AND
 *   - the user has zero workspaces.
 *
 * Completing step 3 calls `markComplete()` which persists the flag.
 */
export function useOnboarding(workspaceCount: number) {
  const [complete, setComplete] = useState<boolean>(() => readFlag());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setComplete(readFlag());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const markComplete = useCallback(() => {
    writeFlag(true);
    setComplete(true);
  }, []);

  const reset = useCallback(() => {
    writeFlag(false);
    setComplete(false);
  }, []);

  const show = !complete && workspaceCount === 0;

  return { show, complete, markComplete, reset };
}
