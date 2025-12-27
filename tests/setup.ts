// tests/setup.ts
import { vi } from 'vitest';

class MockWorker {
  constructor() {}
  onmessage = vi.fn();
  postMessage = vi.fn();
}

vi.stubGlobal('Worker', MockWorker);
