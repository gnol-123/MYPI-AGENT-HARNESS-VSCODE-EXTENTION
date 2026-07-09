import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from '../../agent/loop';
import { ConversationHistory } from '../../agent/history';
import { ToolRegistry } from '../../tools/registry';
import { LLMProvider, LLMEvent, ToolDef, Message } from '../../providers/types';
import { Skill } from '../../skills/loader';

function createMockProvider(responses: LLMEvent[][]): LLMProvider {
  let callIndex = 0;
  return {
    async *streamChat(
      _msgs: Message[],
      _tools: ToolDef[],
      _system: string,
      _maxTokens: number,
    ): AsyncGenerator<LLMEvent> {
      if (callIndex >= responses.length) {
        yield { type: 'done' };
        return;
      }
      for (const event of responses[callIndex]) {
        yield event;
      }
      callIndex++;
    },
  };
}

describe('AgentLoop', () => {
  it('should handle a simple text response', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Hello!' }, { type: 'done' }],
    ]);
    const registry = new ToolRegistry();
    const skills: Skill[] = [];

    const loop = new AgentLoop(provider, registry, skills, 8192, 'test-model', 'test-provider');
    const events: LLMEvent[] = [];
    await loop.run(new ConversationHistory(), 'Hi', (event) => events.push(event));

    expect(events.some((e) => e.type === 'text')).toBe(true);
    const status = loop.getStatus();
    expect(status.model).toBe('test-model');
    expect(status.provider).toBe('test-provider');
    expect(status.cwd).toBeDefined();
  });

  it('should handle tool calls and loop back', async () => {
    const provider = createMockProvider([
      [
        { type: 'tool_use', id: 't1', name: 'read', input: { path: 'test.ts' } },
        { type: 'done' },
      ],
      [
        { type: 'text', text: 'I read the file.' },
        { type: 'done' },
      ],
    ]);

    const registry = new ToolRegistry();
    registry.register({
      name: 'read',
      description: 'Read a file',
      parameters: {},
      execute: async (params) => ({ content: `content of ${params.path}` }),
    });

    const skills: Skill[] = [];
    const loop = new AgentLoop(provider, registry, skills, 8192, 'test-model', 'test-provider');
    const events: LLMEvent[] = [];
    await loop.run(new ConversationHistory(), 'Read test.ts', (event) => events.push(event));

    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(1);
    expect(textEvents[0].text).toBe('I read the file.');
  });

  it('should retain context across runs sharing one history', async () => {
    const seenMessageCounts: number[] = [];
    const provider: LLMProvider = {
      async *streamChat(msgs: Message[]): AsyncGenerator<LLMEvent> {
        seenMessageCounts.push(msgs.length);
        yield { type: 'text', text: 'ok' };
        yield { type: 'done' };
      },
    };
    const registry = new ToolRegistry();
    const skills: Skill[] = [];
    const loop = new AgentLoop(provider, registry, skills, 8192);

    const history = new ConversationHistory();
    await loop.run(history, 'first question', () => {});
    await loop.run(history, 'follow-up', () => {});

    expect(seenMessageCounts[0]).toBe(1);
    expect(seenMessageCounts[1]).toBe(3); // user, assistant, user
  });

  it('should handle errors from provider', async () => {
    const provider = createMockProvider([
      [{ type: 'error', message: 'Rate limited' }],
    ]);
    const registry = new ToolRegistry();
    const skills: Skill[] = [];

    const loop = new AgentLoop(provider, registry, skills, 8192, 'test-model', 'test-provider');
    const events: LLMEvent[] = [];
    await loop.run(new ConversationHistory(), 'Hi', (event) => events.push(event));

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
  });

  it('should return agent status', () => {
    const provider = createMockProvider([]);
    const registry = new ToolRegistry();
    const skills: Skill[] = [];

    const loop = new AgentLoop(provider, registry, skills, 8192, 'gpt-4', 'OpenAI');
    const status = loop.getStatus();
    expect(status.cwd).toBeDefined();
    expect(status.model).toBe('gpt-4');
    expect(status.provider).toBe('OpenAI');
    expect(status.tokenUsage.inputTokens).toBe(0);
    expect(status.tokenUsage.outputTokens).toBe(0);
  });
});
