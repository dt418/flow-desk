import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Clean up DOM between tests to prevent leakage.
afterEach(() => {
  cleanup();
});
