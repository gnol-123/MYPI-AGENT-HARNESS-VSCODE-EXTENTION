import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOpenAICompatProvider } from '../../providers/openai-compat';
import { LLMEvent, ToolDef } from '../../providers/types';

/**
 * Regression tests for the "stuck on Starting..." stall.
 *
 * The chat panel only repaints its status dot when the provider yields an
 * event. During a tool-calling turn the providers used to yield NOTHING until
 * the whole stream had been consumed, so the UI sat on "Starting..." for the
 * entire turn. A provider must emit progress as soon as it knows something:
 * `stream_start` when the response opens, `tool_use_start` when the tool name
 * arrives — both strictly before the terminal `tool_use`.
 */

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

const READ_TOOL: ToolDef = {
  name: 'read',
  description: 'Read a file',
  input_schema: { type: 'object', properties: { path: { type: 'string' } } },
};

/** A turn where the model calls a tool with no preamble text — the common first turn. */
const TOOL_ONLY_SSE = [
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read","arguments":""}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\""}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"a.ts\\"}"}}]}}]}\n\n',
  'data: [DONE]\n\n',
];

afterEach(() => {
  vi.unstubAllGlobals();
});

async function collect(gen: AsyncGenerator<LLMEvent>): Promise<LLMEvent[]> {
  const out: LLMEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('openai-compat streaming progress', () => {
  function stubFetch(chunks: string[]): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(sseStream(chunks), { status: 200 })),
    );
  }

  it('emits stream_start as the first event once the response opens', async () => {
    stubFetch(TOOL_ONLY_SSE);
    const provider = createOpenAICompatProvider({
      apiKey: 'k',
      model: 'glm-4.6',
      baseUrl: 'https://example.test/v1',
      providerKey: 'z-ai',
    });

    const events = await collect(provider.streamChat([{ role: 'user', content: 'hi' }], [READ_TOOL], 'sys', 1024));

    expect(events[0]).toEqual({ type: 'stream_start' });
  });

  it('emits tool_use_start with the tool name before the terminal tool_use', async () => {
    stubFetch(TOOL_ONLY_SSE);
    const provider = createOpenAICompatProvider({
      apiKey: 'k',
      model: 'glm-4.6',
      baseUrl: 'https://example.test/v1',
      providerKey: 'z-ai',
    });

    const events = await collect(provider.streamChat([{ role: 'user', content: 'hi' }], [READ_TOOL], 'sys', 1024));

    const startIdx = events.findIndex((e) => e.type === 'tool_use_start');
    const useIdx = events.findIndex((e) => e.type === 'tool_use');

    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(events[startIdx]).toEqual({ type: 'tool_use_start', id: 'call_1', name: 'read' });
    expect(startIdx).toBeLessThan(useIdx);
  });

  it('still yields the fully-assembled tool_use at the end', async () => {
    stubFetch(TOOL_ONLY_SSE);
    const provider = createOpenAICompatProvider({
      apiKey: 'k',
      model: 'glm-4.6',
      baseUrl: 'https://example.test/v1',
      providerKey: 'z-ai',
    });

    const events = await collect(provider.streamChat([{ role: 'user', content: 'hi' }], [READ_TOOL], 'sys', 1024));

    expect(events.find((e) => e.type === 'tool_use')).toEqual({
      type: 'tool_use',
      id: 'call_1',
      name: 'read',
      input: { path: 'a.ts' },
    });
  });

  it('emits tool_use_start only once per tool call', async () => {
    stubFetch(TOOL_ONLY_SSE);
    const provider = createOpenAICompatProvider({
      apiKey: 'k',
      model: 'glm-4.6',
      baseUrl: 'https://example.test/v1',
      providerKey: 'z-ai',
    });

    const events = await collect(provider.streamChat([{ role: 'user', content: 'hi' }], [READ_TOOL], 'sys', 1024));

    expect(events.filter((e) => e.type === 'tool_use_start')).toHaveLength(1);
  });
});
