import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../agent/loop';
import { ConversationHistory } from '../../agent/history';
import { ToolRegistry } from '../../tools/registry';
import { LLMProvider, LLMEvent, ToolDef, Message } from '../../providers/types';
import { Skill } from '../../skills/loader';

/**
 * The panel renders progress from events the loop forwards. If the loop drops
 * stream_start / tool_use_start, the provider fix never reaches the UI and the
 * status dot stays on "Starting..." for the whole turn.
 */
function providerYielding(events: LLMEvent[][]): LLMProvider {
  let call = 0;
  return {
    async *streamChat(_m: Message[], _t: ToolDef[], _s: string, _mt: number): AsyncGenerator<LLMEvent> {
      if (call >= events.length) {
        yield { type: 'done' };
        return;
      }
      for (const e of events[call]) yield e;
      call++;
    },
  };
}

describe('AgentLoop progress forwarding', () => {
  it('forwards stream_start and tool_use_start without treating them as tool calls', async () => {
    const provider = providerYielding([
      [
        { type: 'stream_start' },
        { type: 'tool_use_start', id: 't1', name: 'read' },
        { type: 'tool_use', id: 't1', name: 'read', input: { path: 'a.ts' } },
        { type: 'done' },
      ],
      [{ type: 'stream_start' }, { type: 'text', text: 'done.' }, { type: 'done' }],
    ]);

    let executions = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: 'read',
      description: 'Read a file',
      parameters: {},
      execute: async () => {
        executions++;
        return { content: 'file body' };
      },
    });

    const seen: LLMEvent[] = [];
    const loop = new AgentLoop(provider, registry, [] as Skill[], 8192, 'm', 'p');
    await loop.run(new ConversationHistory(), 'read a.ts', (e) => seen.push(e));

    expect(seen.filter((e) => e.type === 'stream_start')).toHaveLength(2);
    expect(seen.filter((e) => e.type === 'tool_use_start')).toEqual([
      { type: 'tool_use_start', id: 't1', name: 'read' },
    ]);
    // tool_use_start must not cause a second execution of the same tool.
    expect(executions).toBe(1);
  });

  it('drives the provider when effort changes, and on construction', async () => {
    const applied: string[] = [];
    const provider: LLMProvider = {
      async *streamChat(): AsyncGenerator<LLMEvent> {
        yield { type: 'done' };
      },
      setThinkingEffort(effort) {
        applied.push(effort);
      },
    };

    const loop = new AgentLoop(provider, new ToolRegistry(), [] as Skill[], 8192, 'm', 'p', '', [], 'medium');
    expect(applied).toEqual(['medium']);

    loop.setThinkingEffort('high');
    expect(applied).toEqual(['medium', 'high']);
    expect(loop.getThinkingEffort()).toBe('high');
  });

  it('accumulates cache token classes across requests', async () => {
    const provider = providerYielding([
      [
        { type: 'usage', inputTokens: 10, outputTokens: 1, cacheReadTokens: 100, cacheWriteTokens: 5 },
        { type: 'tool_use', id: 't1', name: 'read', input: {} },
        { type: 'done' },
      ],
      [
        { type: 'usage', inputTokens: 20, outputTokens: 2, cacheReadTokens: 200, cacheWriteTokens: 0 },
        { type: 'text', text: 'ok' },
        { type: 'done' },
      ],
    ]);

    const registry = new ToolRegistry();
    registry.register({ name: 'read', description: 'r', parameters: {}, execute: async () => ({ content: 'x' }) });

    const loop = new AgentLoop(provider, registry, [] as Skill[], 8192, 'm', 'p');
    await loop.run(new ConversationHistory(), 'go', () => {});

    expect(loop.getStatus().tokenUsage).toEqual({
      inputTokens: 30,
      outputTokens: 3,
      cacheReadTokens: 300,
      cacheWriteTokens: 5,
    });
  });

  it('keeps progress events out of conversation history', async () => {
    const provider = providerYielding([
      [{ type: 'stream_start' }, { type: 'tool_use_start', id: 't1', name: 'read' }, { type: 'text', text: 'hi' }, { type: 'done' }],
    ]);

    const history = new ConversationHistory();
    const loop = new AgentLoop(provider, new ToolRegistry(), [] as Skill[], 8192, 'm', 'p');
    await loop.run(history, 'hello', () => {});

    const assistant = history.getMessages().filter((m) => m.role === 'assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0].content).toBe('hi');
  });
});
