import * as vscode from 'vscode';
import * as path from 'path';
import { ToolHandler, ToolResult } from './types';

export const writeTool: ToolHandler = {
  name: 'write',
  description: 'Write content to a file. Creates the file and parent directories if they do not exist.',
  parameters: {
    type: 'object',
    required: ['path', 'content'],
    properties: {
      path: { type: 'string', description: 'Path to the file to write (relative or absolute)' },
      content: { type: 'string', description: 'Content to write to the file' },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Models trained on Claude Code tooling often emit file_path.
      const filePath = (params.path ?? params.file_path ?? params.filePath) as string;
      const content = params.content as string;

      if (!filePath) return { content: '', error: 'Missing required parameter: path' };
      if (content === undefined || content === null) return { content: '', error: 'Missing required parameter: content' };

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return { content: '', error: 'No workspace folder open' };
      }

      const uri = path.isAbsolute(filePath)
        ? vscode.Uri.file(filePath)
        : vscode.Uri.joinPath(workspaceFolder.uri, filePath);

      const dirUri = vscode.Uri.file(path.dirname(uri.fsPath));
      await vscode.workspace.fs.createDirectory(dirUri);

      const data = new TextEncoder().encode(content);
      await vscode.workspace.fs.writeFile(uri, data);

      await vscode.window.showTextDocument(uri, { preview: false });

      return { content: `Successfully wrote ${Buffer.byteLength(content)} bytes to ${filePath}` };
    } catch (err) {
      return { content: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
};
