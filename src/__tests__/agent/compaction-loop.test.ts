import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../agent/loop';
import { ConversationHistory } from '../../agent/history';
import { ToolRegistry } from '../../tools/registry';
import { LLMProvider, LLMEvent, Message, ToolDef } from '../../providers/types';

/**
 * End-to-end: does the loop actually compact before a request that would
 * overflow, and is the resulting history still a valid conversation?
 */

/** glm-4.5-flash has a 128K window; ~600k chars of history blows past 80%. */
const MODEL = 'glm-4.5-flash';

function bigHistory(): ConversationHistory {
  const h = new ConversationHistory();
  h.addUserMessage('the original task');
  for (let i = 0; i < 12; i++) {
    h.addAssistantMessage(`step ${i}`, [{ id: `t${i}`, name: 'read', input: { path: `f${i}.ts` } }]);
    h.addToolResult(`t${i}`, 'x'.repeat(50_000));
  }
  return h;
}

/** Records every request the loop sends, so we can inspect what was compacted. */
function recordingProvider(): { provider: LLMProvider; requests: Message[][] } {
  const requests: Message[][] = [];
  let call = 0;
  const provider: LLMProvider = {
    async *streamChat(messages: Message[], tools: ToolDef[]): AsyncGenerator<LLMEvent> {
      requests.push(JSON.parse(JSON.stringify(messages)));
      // The summarization call passes no tools — answer it with a summary.
      if (tools.length === 0 && call > 0) {
        yield { type: 'text', text: 'SUMMARY: read 12 files, found the bug in f3.ts' };
        yield { type: 'done' };
        return;
      }
      call++;
      yield { type: 'text', text: 'done working' };
      yield { type: 'done' };
    },
  };
  return { provider, requests };
}

describe('compaction inside the agent loop', () => {
  it('compacts before sending when the history would overflow', async () => {
    const { provider, requests } = recordingProvider();
    const loop = new AgentLoop(provider, new ToolRegistry(), [], 4096, MODEL, 'z-ai');
    const history = bigHistory();
    const before = history.getMessages().length;

    const events: LLMEvent[] = [];
    await loop.run(history, 'continue', (e) => events.push(e));

    expect(events.some((e) => e.type === 'compaction_start')).toBe(true);
    expect(events.some((e) => e.type === 'compaction_done')).toBe(true);
    expect(history.getMessages().length).toBeLessThan(before);
  }, 20_000);

  it('leaves a valid conversation: starts on user, keeps the original task', async () => {
    const { provider } = recordingProvider();
    const loop = new AgentLoop(provider, new ToolRegistry(), [], 4096, MODEL, 'z-ai');
    const history = bigHistory();

    await loop.run(history, 'continue', () => {});

    const msgs = history.getMessages();
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('the original task');
    expect(JSON.stringify(msgs)).toContain('SUMMARY: read 12 files');
  }, 20_000);

  it('never orphans a tool_use from its tool_result', async () => {
    const { provider } = recordingProvider();
    const loop = new AgentLoop(provider, new ToolRegistry(), [], 4096, MODEL, 'z-ai');
    const history = bigHistory();

    await loop.run(history, 'continue', () => {});

    for (const m of history.getMessages()) {
      if (typeof m.content === 'string') continue;
      const uses = m.content.filter((b) => b.type === 'tool_use').map((b) => b.id);
      const results = m.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id);
      // Every tool_use in a message has its result in the same message.
      for (const id of uses) expect(results).toContain(id);
      for (const id of results) expect(uses).toContain(id);
    }
  }, 20_000);

  it('does not compact a short history', async () => {
    const { provider } = recordingProvider();
    const loop = new AgentLoop(provider, new ToolRegistry(), [], 4096, MODEL, 'z-ai');
    const history = new ConversationHistory();

    const events: LLMEvent[] = [];
    await loop.run(history, 'hi', (e) => events.push(e));

    expect(events.some((e) => e.type === 'compaction_start')).toBe(false);
  });

  it('continues the run when summarization fails, rather than aborting', async () => {
    // The summarization request is the one sent with no tools.
    const provider: LLMProvider = {
      async *streamChat(_m, tools): AsyncGenerator<LLMEvent> {
        if (tools.length === 0) {
          yield { type: 'error', message: 'summarizer exploded' };
          return;
        }
        yield { type: 'text', text: 'carried on' };
        yield { type: 'done' };
      },
    };

    // A registered tool makes the summarization request (no tools) distinguishable.
    const registry = new ToolRegistry();
    registry.register({ name: 'read', description: 'r', parameters: {}, execute: async () => ({ content: 'x' }) });

    const loop = new AgentLoop(provider, registry, [], 4096, MODEL, 'z-ai');
    const events: LLMEvent[] = [];
    await loop.run(bigHistory(), 'continue', (e) => events.push(e));

    // The failure is surfaced, not swallowed...
    expect(events.some((e) => e.type === 'error' && /Could not compact/.test((e as any).message))).toBe(true);
    // ...and the run survives: an oversized prompt beats no answer at all.
    expect(events.some((e) => e.type === 'text' && (e as any).text === 'carried on')).toBe(true);
  }, 20_000);
});
