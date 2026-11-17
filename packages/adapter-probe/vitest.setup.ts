import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});
