import { ToolHandler, ToolResult } from './types';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

const STATUSES: TodoStatus[] = ['pending', 'in_progress', 'completed'];

/**
 * Typed view of a todo_write payload, or undefined when malformed. The chat
 * panel uses this on the tool_use event to render the pinned checklist, so it
 * must never throw on model-generated input.
 */
export function parseTodos(params: Record<string, unknown>): TodoItem[] | undefined {
  const raw = params.todos;
  if (!Array.isArray(raw)) return undefined;
  const items: TodoItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const { content, status } = entry as Record<string, unknown>;
    if (typeof content !== 'string' || !content.trim()) return undefined;
    if (typeof status !== 'string' || !STATUSES.includes(status as TodoStatus)) return undefined;
    items.push({ content: content.trim(), status: status as TodoStatus });
  }
  return items;
}

export const todoWriteTool: ToolHandler = {
  name: 'todo_write',
  description:
    'Update your task list for the current session. Pass the COMPLETE list every time — it replaces the previous one. ' +
    'Use this very frequently: write the list before starting multi-step work, mark an item in_progress before you begin it ' +
    '(at most one at a time), and mark it completed immediately when done, not in batches at the end. ' +
    'The list is shown to the user as a live checklist, so keeping it current is how they track your progress.',
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'The full task list (replaces the previous list)',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Short imperative description of the task' },
            status: { type: 'string', enum: STATUSES },
          },
          required: ['content', 'status'],
        },
      },
    },
    required: ['todos'],
  },
  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const items = parseTodos(params);
    if (!items) {
      return {
        content: '',
        error:
          'Invalid todos payload. Expected { todos: [{ content: string, status: "pending"|"in_progress"|"completed" }] }.',
      };
    }
    const inProgress = items.filter((t) => t.status === 'in_progress');
    if (inProgress.length > 1) {
      return {
        content: '',
        error: 'Only one todo may be in_progress at a time. Finish or park the current item first.',
      };
    }
    const done = items.filter((t) => t.status === 'completed').length;
    return { content: `Todo list updated (${done}/${items.length} completed).` };
  },
};
