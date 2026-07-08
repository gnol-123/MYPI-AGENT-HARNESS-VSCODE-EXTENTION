import * as vscode from 'vscode';
import * as path from 'path';
import { ToolHandler, ToolResult } from './types';

interface Edit {
  oldText: string;
  newText: string;
}

export const editTool: ToolHandler = {
  name: 'edit',
  description: 'Edit a single file using exact text replacement. Each edits[].oldText must match a unique region of the file.',
  parameters: {
    type: 'object',
    required: ['path', 'edits'],
    properties: {
      path: { type: 'string', description: 'Path to the file to edit (relative or absolute)' },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          required: ['oldText', 'newText'],
          properties: {
            oldText: { type: 'string', description: 'Exact text to replace' },
            newText: { type: 'string', description: 'Replacement text' },
          },
        },
        description: 'One or more targeted replacements',
      },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const filePath = params.path as string;
      const edits = params.edits as Edit[];

      if (!filePath) return { content: '', error: 'Missing required parameter: path' };
      if (!edits || !Array.isArray(edits) || edits.length === 0) {
        return { content: '', error: 'Missing required parameter: edits' };
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return { content: '', error: 'No workspace folder open' };
      }

      const uri = path.isAbsolute(filePath)
        ? vscode.Uri.file(filePath)
        : vscode.Uri.joinPath(workspaceFolder.uri, filePath);

      const document = await vscode.workspace.openTextDocument(uri);
      const fullText = document.getText();

      const workspaceEdit = new vscode.WorkspaceEdit();

      for (const edit of edits) {
        const startIndex = fullText.indexOf(edit.oldText);
        if (startIndex === -1) {
          return { content: '', error: `Could not find text to replace:\n${edit.oldText.substring(0, 200)}` };
        }

        const secondOccurrence = fullText.indexOf(edit.oldText, startIndex + 1);
        if (secondOccurrence !== -1) {
          return { content: '', error: `oldText is not unique in the file; it appears multiple times:\n${edit.oldText.substring(0, 200)}` };
        }

        const startPos = document.positionAt(startIndex);
        const endPos = document.positionAt(startIndex + edit.oldText.length);
        const range = new vscode.Range(startPos, endPos);

        workspaceEdit.replace(uri, range, edit.newText);
      }

      const applied = await vscode.workspace.applyEdit(workspaceEdit);
      if (!applied) {
        return { content: '', error: 'Failed to apply edits' };
      }

      return { content: `Successfully applied ${edits.length} edit(s) to ${filePath}` };
    } catch (err) {
      return { content: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
};
