import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn(() => true), readFileSync: vi.fn(() => '') };
});

vi.mock('os', () => ({
  homedir: () => '/home/user',
}));

import { exec } from 'child_process';
import { context7Tool } from '../../tools/context7';

describe('context7 tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "context7"', () => {
    expect(context7Tool.name).toBe('context7');
  });

  it('should require a command', async () => {
    const result = await context7Tool.execute({ command: '', args: [] });
    expect(result.error).toContain('Missing required parameter');
  });

  it('should reject unknown commands', async () => {
    const result = await context7Tool.execute({ command: 'unknown', args: [] });
    expect(result.error).toContain('Unknown command');
  });

  it('should return error without API key', async () => {
    // Clear env var if set
    const prev = process.env.CONTEXT7_API_KEY;
    delete process.env.CONTEXT7_API_KEY;

    const result = await context7Tool.execute({ command: 'search', args: ['react'] });

    if (prev) process.env.CONTEXT7_API_KEY = prev;

    expect(result.error).toContain('No Context7 API key');
  });
});
