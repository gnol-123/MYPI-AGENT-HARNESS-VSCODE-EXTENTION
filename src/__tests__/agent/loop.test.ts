import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from '../../agent/loop';
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

    const loop = new AgentLoop(provider, registry, skills, 8192);
    const events: LLMEvent[] = [];
    await loop.run('Hi', (event) => events.push(event));

    expect(events.some((e) => e.type === 'text')).toBe(true);
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
    const loop = new AgentLoop(provider, registry, skills, 8192);
    const events: LLMEvent[] = [];
    await loop.run('Read test.ts', (event) => events.push(event));

    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(1);
    expect(textEvents[0].text).toBe('I read the file.');
  });

  it('should handle errors from provider', async () => {
    const provider = createMockProvider([
      [{ type: 'error', message: 'Rate limited' }],
    ]);
    const registry = new ToolRegistry();
    const skills: Skill[] = [];

    const loop = new AgentLoop(provider, registry, skills, 8192);
    const events: LLMEvent[] = [];
    await loop.run('Hi', (event) => events.push(event));

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
  });
});
