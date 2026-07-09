import { describe, it, expect } from 'vitest';
import { todoWriteTool, parseTodos, TodoItem } from '../../tools/todo';

/**
 * Claude Code parity: todo_write replaces the whole list each call (same
 * semantics as TodoWrite). The panel renders the list from the tool_use
 * event's input, so the tool itself only validates and acknowledges.
 */
describe('todo_write tool', () => {
  it('accepts a valid list and echoes a progress summary', async () => {
    const result = await todoWriteTool.execute({
      todos: [
        { content: 'read the config', status: 'completed' },
        { content: 'fix the bug', status: 'in_progress' },
        { content: 'run the tests', status: 'pending' },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('1/3');
  });

  it('rejects a payload without a todos array', async () => {
    const result = await todoWriteTool.execute({});
    expect(result.error).toBeTruthy();
  });

  it('rejects items with a bogus status', async () => {
    const result = await todoWriteTool.execute({
      todos: [{ content: 'x', status: 'someday' }],
    });
    expect(result.error).toBeTruthy();
  });

  it('rejects items with empty content', async () => {
    const result = await todoWriteTool.execute({
      todos: [{ content: '   ', status: 'pending' }],
    });
    expect(result.error).toBeTruthy();
  });

  it('accepts an empty list (clears the board)', async () => {
    const result = await todoWriteTool.execute({ todos: [] });
    expect(result.error).toBeUndefined();
  });

  it('allows at most one item in_progress at a time', async () => {
    const result = await todoWriteTool.execute({
      todos: [
        { content: 'a', status: 'in_progress' },
        { content: 'b', status: 'in_progress' },
      ],
    });
    expect(result.error).toMatch(/one .*in_progress/i);
  });
});

describe('parseTodos', () => {
  it('returns the typed list for a valid payload', () => {
    const items = parseTodos({ todos: [{ content: 'a', status: 'pending' }] });
    expect(items).toEqual<TodoItem[]>([{ content: 'a', status: 'pending' }]);
  });

  it('returns undefined for garbage, so the panel can ignore malformed calls', () => {
    expect(parseTodos({ todos: 'nope' })).toBeUndefined();
    expect(parseTodos({})).toBeUndefined();
    expect(parseTodos({ todos: [{ status: 'pending' }] })).toBeUndefined();
  });
});
