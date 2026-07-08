import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'child_process';
import { bashTool } from '../../tools/bash';

describe('bash tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "bash"', () => {
    expect(bashTool.name).toBe('bash');
  });

  it('should execute a command and return stdout', async () => {
    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation((_cmd: any, _opts: any, cb: any) => {
      cb(null, 'hello stdout', '');
      return {} as any;
    });

    const result = await bashTool.execute({ command: 'echo hello' });
    expect(result.content).toContain('hello stdout');
  });

  it('should return stderr on non-zero exit', async () => {
    const mockExec = vi.mocked(exec);
    mockExec.mockImplementation((_cmd: any, _opts: any, cb: any) => {
      const err: any = new Error('command failed');
      err.code = 1;
      err.killed = false;
      cb(err, '', 'error output');
      return {} as any;
    });

    const result = await bashTool.execute({ command: 'false' });
    expect(result.error).toBeDefined();
    expect(result.content).toContain('error output');
  });
});
