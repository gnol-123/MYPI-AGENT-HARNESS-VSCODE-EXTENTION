import * as vscode from 'vscode';
import * as path from 'path';
import { ToolHandler, ToolResult } from './types';

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024;

function resolvePath(filePath: string): vscode.Uri {
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('No workspace folder open');
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, filePath);
}

async function readFileContent(uri: vscode.Uri, offset?: number, limit?: number): Promise<ToolResult> {
  const raw = await vscode.workspace.fs.readFile(uri);
  const text = new TextDecoder().decode(raw);

  let content = text;
  let truncated = false;

  const lines = content.split('\n');
  const startLine = offset ? offset - 1 : 0;
  const maxLines = limit ?? MAX_LINES;

  if (startLine > 0 || lines.length > maxLines) {
    content = lines.slice(startLine, startLine + maxLines).join('\n');
    if (lines.length > startLine + maxLines) {
      truncated = true;
    }
  }

  if (content.length > MAX_BYTES) {
    content = content.substring(0, MAX_BYTES);
    truncated = true;
  }

  return { content, truncated: truncated || undefined };
}

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

function isImageFile(uri: vscode.Uri): boolean {
  const ext = path.extname(uri.fsPath).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

export const readTool: ToolHandler = {
  name: 'read',
  description: 'Read the contents of a file. Supports text files and images. Output is truncated to 2000 lines or 50KB.',
  parameters: {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', description: 'Path to the file to read (relative or absolute)' },
      offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
      limit: { type: 'number', description: 'Maximum number of lines to read' },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Models trained on Claude Code tooling often emit file_path.
      const filePath = (params.path ?? params.file_path ?? params.filePath) as string;
      if (!filePath) {
        return { content: '', error: 'Missing required parameter: path' };
      }

      const uri = resolvePath(filePath);

      if (isImageFile(uri)) {
        const raw = await vscode.workspace.fs.readFile(uri);
        const base64 = Buffer.from(raw).toString('base64');
        const mimeType = `image/${path.extname(uri.fsPath).slice(1)}`;
        return { content: `data:${mimeType};base64,${base64}` };
      }

      return await readFileContent(uri, params.offset as number | undefined, params.limit as number | undefined);
    } catch (err) {
      return { content: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
};
