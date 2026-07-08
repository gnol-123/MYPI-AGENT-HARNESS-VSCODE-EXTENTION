import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockCreateDirectory = vi.fn();
const mockOpenTextDocument = vi.fn();
const mockApplyEdit = vi.fn();
const mockShowTextDocument = vi.fn();

vi.mock('vscode', () => ({
  workspace: {
    fs: {
      readFile: (...args: any[]) => mockReadFile(...args),
      writeFile: (...args: any[]) => mockWriteFile(...args),
      createDirectory: (...args: any[]) => mockCreateDirectory(...args),
    },
    openTextDocument: (...args: any[]) => mockOpenTextDocument(...args),
    applyEdit: (...args: any[]) => mockApplyEdit(...args),
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    joinPath: (base: any, ...args: string[]) => ({
      fsPath: base.fsPath + '/' + args.join('/'),
      scheme: 'file',
    }),
  },
  WorkspaceEdit: vi.fn(function(this: any) { this.replace = vi.fn(); }),
  Range: vi.fn(function(this: any, s: any, e: any) { this.start = s; this.end = e; }),
  Position: vi.fn(function(this: any, l: number, c: number) { this.line = l; this.character = c; }),
  window: {
    showTextDocument: (...args: any[]) => mockShowTextDocument(...args),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInputBox: vi.fn(),
  },
}));

import { readTool } from '../../tools/read';
import { writeTool } from '../../tools/write';
import { editTool } from '../../tools/edit';

describe('read tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "read"', () => {
    expect(readTool.name).toBe('read');
  });

  it('should read a file and return content', async () => {
    const mockContent = new TextEncoder().encode('hello world');
    mockReadFile.mockResolvedValue(mockContent);

    const result = await readTool.execute({ path: 'test.txt' });

    expect(result.content).toBe('hello world');
    expect(result.truncated).toBeUndefined();
  });

  it('should return error for missing file', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const result = await readTool.execute({ path: 'nonexistent.txt' });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('ENOENT');
  });
});

describe('write tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "write"', () => {
    expect(writeTool.name).toBe('write');
  });

  it('should write content to a file', async () => {
    const result = await writeTool.execute({ path: 'newfile.ts', content: 'const x = 1;' });

    expect(result.content).toContain('Successfully wrote');
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockShowTextDocument).toHaveBeenCalled();
  });

  it('should return error for write failure', async () => {
    mockWriteFile.mockRejectedValue(new Error('EACCES'));

    const result = await writeTool.execute({ path: 'readonly.ts', content: 'x' });

    expect(result.error).toContain('EACCES');
  });
});

describe('edit tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "edit"', () => {
    expect(editTool.name).toBe('edit');
  });

  it('should replace exact text in a file', async () => {
    const mockDoc = {
      getText: () => 'function hello() {\n  console.log("hello");\n}',
      uri: { fsPath: '/workspace/test.ts', scheme: 'file' },
      positionAt: (idx: number) => {
        const lines = 'function hello() {\n  console.log("hello");\n}'.split('\n');
        let currentIdx = 0;
        for (let i = 0; i < lines.length; i++) {
          if (currentIdx + lines[i].length >= idx) {
            return { line: i, character: idx - currentIdx };
          }
          currentIdx += lines[i].length + 1;
        }
        return { line: 0, character: 0 };
      },
    };
    mockOpenTextDocument.mockResolvedValue(mockDoc);
    mockApplyEdit.mockResolvedValue(true);

    const result = await editTool.execute({
      path: 'test.ts',
      edits: [{ oldText: 'console.log("hello")', newText: 'console.log("hi")' }],
    });

    expect(result.content).toContain('Successfully applied');
    expect(mockApplyEdit).toHaveBeenCalled();
  });

  it('should return error when oldText is not found', async () => {
    const mockDoc = {
      getText: () => 'function hello() {}',
      uri: { fsPath: '/workspace/test.ts', scheme: 'file' },
      positionAt: () => ({ line: 0, character: 0 }),
    };
    mockOpenTextDocument.mockResolvedValue(mockDoc);

    const result = await editTool.execute({
      path: 'test.ts',
      edits: [{ oldText: 'nonexistent', newText: 'x' }],
    });

    expect(result.error).toBeDefined();
  });
});
