import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMEvent, ToolDef } from '../../providers/types';

/** Captures the params handed to client.messages.stream(). */
let lastParams: any;
let streamEvents: any[] = [];
let finalMessage: any;

function fakeStream() {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of streamEvents) yield e;
    },
    finalMessage: async () => finalMessage,
  };
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (params: any) => {
        lastParams = params;
        return fakeStream();
      },
    };
  },
}));

// Imported after the mock is registered.
const { createAnthropicProvider } = await import('../../providers/anthropic');

const READ_TOOL: ToolDef = {
  name: 'read',
  description: 'Read a file',
  input_schema: { type: 'object', properties: { path: { type: 'string' } } },
};

/** A turn where the model goes straight to a tool call: no text, no thinking. */
const TOOL_ONLY_EVENTS = [
  { type: 'message_start', message: { id: 'msg_1' } },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: 'toolu_1', name: 'read', input: {} },
  },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path"' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: ':"a.ts"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_stop' },
];

async function collect(gen: AsyncGenerator<LLMEvent>): Promise<LLMEvent[]> {
  const out: LLMEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

function run(): Promise<LLMEvent[]> {
  const provider = createAnthropicProvider({
    apiKey: 'k',
    model: 'claude-sonnet-5',
    thinkingLevel: 'off',
  });
  return collect(provider.streamChat([{ role: 'user', content: 'read a.ts' }], [READ_TOOL], 'SYSTEM', 4096));
}

beforeEach(() => {
  lastParams = undefined;
  streamEvents = TOOL_ONLY_EVENTS;
  finalMessage = {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'read', input: { path: 'a.ts' } }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
});

describe('anthropic streaming progress', () => {
  it('emits stream_start on message_start, before any content', async () => {
    const events = await run();
    expect(events[0]).toEqual({ type: 'stream_start' });
  });

  it('emits tool_use_start from content_block_start, before the terminal tool_use', async () => {
    const events = await run();
    const startIdx = events.findIndex((e) => e.type === 'tool_use_start');
    const useIdx = events.findIndex((e) => e.type === 'tool_use');

    expect(events[startIdx]).toEqual({ type: 'tool_use_start', id: 'toolu_1', name: 'read' });
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeLessThan(useIdx);
  });

  it('still yields the assembled tool_use and usage', async () => {
    const events = await run();
    expect(events.find((e) => e.type === 'tool_use')).toEqual({
      type: 'tool_use',
      id: 'toolu_1',
      name: 'read',
      input: { path: 'a.ts' },
    });
    expect(events.find((e) => e.type === 'usage')).toEqual({
      type: 'usage',
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });
});

describe('anthropic prompt caching', () => {
  it('puts a cache breakpoint on the system block (covers tools + system)', async () => {
    await run();
    expect(lastParams.system).toEqual([
      { type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('puts a cache breakpoint on the tail of the conversation', async () => {
    await run();
    const last = lastParams.messages[lastParams.messages.length - 1];
    const tail = last.content[last.content.length - 1];
    expect(tail.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('leaves an empty trailing message untouched rather than sending an empty text block', async () => {
    const provider = createAnthropicProvider({ apiKey: 'k', model: 'claude-sonnet-5', thinkingLevel: 'off' });
    await collect(provider.streamChat([{ role: 'user', content: '' }], [READ_TOOL], 'SYSTEM', 4096));
    expect(lastParams.messages[0].content).toBe('');
  });
});

describe('anthropic thinking budget', () => {
  async function runWithEffort(level: 'off' | 'low' | 'medium' | 'high') {
    const provider = createAnthropicProvider({ apiKey: 'k', model: 'claude-sonnet-5', thinkingLevel: level });
    await collect(provider.streamChat([{ role: 'user', content: 'hi' }], [], 'SYSTEM', 4096));
  }

  it('disables reasoning on low — the fast setting must not burn thinking tokens', async () => {
    await runWithEffort('low');
    expect(lastParams.thinking).toBeUndefined();
  });

  it('omits thinking entirely when the level is off', async () => {
    await runWithEffort('off');
    expect(lastParams.thinking).toBeUndefined();
  });

  it('scales the budget with the level rather than always using medium', async () => {
    await runWithEffort('medium');
    expect(lastParams.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });

    await runWithEffort('high');
    expect(lastParams.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
  });

  it('applies setThinkingEffort to the very next request, without a rebuild', async () => {
    const provider = createAnthropicProvider({ apiKey: 'k', model: 'claude-sonnet-5', thinkingLevel: 'low' });

    await collect(provider.streamChat([{ role: 'user', content: 'hi' }], [], 'SYSTEM', 4096));
    expect(lastParams.thinking).toBeUndefined();

    provider.setThinkingEffort!('high');
    await collect(provider.streamChat([{ role: 'user', content: 'hi' }], [], 'SYSTEM', 4096));
    expect(lastParams.thinking).toEqual({ type: 'enabled', budget_tokens: 8192 });
  });
});

describe('anthropic usage reporting', () => {
  it('reports cache classes separately so they are not billed as fresh input', async () => {
    finalMessage = {
      content: [],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 300,
      },
    };
    const events = await run();
    expect(events.find((e) => e.type === 'usage')).toEqual({
      type: 'usage',
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5000,
      cacheWriteTokens: 300,
    });
  });
});
