import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom doesn't provide ResizeObserver — cmdk and other libs need it.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't provide scrollIntoView — cmdk needs it for keyboard nav.
HTMLElement.prototype.scrollIntoView = function () {};

// Clean up DOM between tests to prevent leakage.
afterEach(() => {
  cleanup();
});
