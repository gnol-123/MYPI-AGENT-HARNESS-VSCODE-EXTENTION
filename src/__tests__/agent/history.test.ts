import { describe, it, expect } from 'vitest';
import { ConversationHistory } from '../../agent/history';

describe('ConversationHistory', () => {
  it('should add and retrieve messages', () => {
    const history = new ConversationHistory();
    history.addUserMessage('hello');
    history.addAssistantMessage('hi there');

    const messages = history.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('should add tool results', () => {
    const history = new ConversationHistory();
    history.addAssistantMessage('', [
      { id: 'tool_1', name: 'read', input: { path: 'test.ts' } },
    ]);
    history.addToolResult('tool_1', 'file content here');

    const messages = history.getMessages();
    expect(messages).toHaveLength(1);
    const content = messages[0].content;
    expect(Array.isArray(content)).toBe(true);

    const parts = content as Array<{ type: string; content?: string }>;
    const toolResultPart = parts.find((p) => p.type === 'tool_result');
    expect(toolResultPart).toBeDefined();
    expect(toolResultPart!.content).toBe('file content here');
  });

  it('should clear history', () => {
    const history = new ConversationHistory();
    history.addUserMessage('hello');
    history.clear();
    expect(history.getMessages()).toHaveLength(0);
  });
});
