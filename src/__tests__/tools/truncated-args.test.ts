import { describe, it, expect, vi, afterEach } from 'vitest';

const mockWriteFile = vi.fn();
const mockCreateDirectory = vi.fn();
const mockShowTextDocument = vi.fn();
const mockReadFile = vi.fn();

vi.mock('vscode', () => ({
  workspace: {
    fs: {
      readFile: (...args: any[]) => mockReadFile(...args),
      writeFile: (...args: any[]) => mockWriteFile(...args),
      createDirectory: (...args: any[]) => mockCreateDirectory(...args),
    },
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    joinPath: (base: any, ...args: string[]) => ({ fsPath: base.fsPath + '/' + args.join('/'), scheme: 'file' }),
  },
  window: { showTextDocument: (...args: any[]) => mockShowTextDocument(...args) },
}));

import { writeTool } from '../../tools/write';
import { createOpenAICompatProvider } from '../../providers/openai-compat';
import { AgentLoop } from '../../agent/loop';
import { ConversationHistory } from '../../agent/history';
import { ToolRegistry } from '../../tools/registry';
import { LLMProvider, LLMEvent, Message, ToolDef } from '../../providers/types';

/**
 * The /design + lavish "Missing required parameter: path" repeat-loop.
 *
 * A lavish page is one huge `write` call. At max_tokens the argument JSON is
 * cut mid-string (finish_reason "length"), JSON.parse fails, and the provider
 * used to silently yield input: {} — the tool then errored with "Missing
 * required parameter: path" and the model, never told the real cause, retried
 * the same oversized write forever.
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

async function collect(gen: AsyncGenerator<LLMEvent>): Promise<LLMEvent[]> {
  const out: LLMEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe('write tool param aliases (Claude Code drift)', () => {
  it('accepts file_path as an alias for path', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    mockCreateDirectory.mockResolvedValue(undefined);
    const result = await writeTool.execute({ file_path: 'a.html', content: '<html/>' });
    expect(result.error).toBeUndefined();
  });

  it('still accepts the canonical path param', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    mockCreateDirectory.mockResolvedValue(undefined);
    const result = await writeTool.execute({ path: 'a.html', content: '<html/>' });
    expect(result.error).toBeUndefined();
  });
});

describe('openai-compat truncated tool arguments', () => {
  it('marks the tool_use with argsError instead of silently passing {}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sseStream([
      // Arguments cut mid-string; finish_reason length signals the token cap.
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"write","arguments":"{\\"path\\":\\"a.html\\",\\"content\\":\\"<html><bo"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ]), { status: 200 })));

    const provider = createOpenAICompatProvider({
      apiKey: 'k', model: 'glm-4.6', baseUrl: 'https://x.test/v1', providerKey: 'z-ai',
    });
    const events = await collect(provider.streamChat([{ role: 'user', content: 'go' }], [], 'sys', 1024));
    const tu = events.find((e) => e.type === 'tool_use') as any;

    expect(tu).toBeDefined();
    expect(tu.argsError).toMatch(/max_tokens|token limit|truncat/i);
  });

  it('does not set argsError on well-formed arguments', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sseStream([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"write","arguments":"{\\"path\\":\\"a.html\\"}"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ]), { status: 200 })));

    const provider = createOpenAICompatProvider({
      apiKey: 'k', model: 'glm-4.6', baseUrl: 'https://x.test/v1', providerKey: 'z-ai',
    });
    const events = await collect(provider.streamChat([{ role: 'user', content: 'go' }], [], 'sys', 1024));
    const tu = events.find((e) => e.type === 'tool_use') as any;
    expect(tu.argsError).toBeUndefined();
    expect(tu.input).toEqual({ path: 'a.html' });
  });
});

describe('agent loop handling of argsError', () => {
  it('skips execution and feeds the model an actionable error instead', async () => {
    let executed = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: 'write', description: 'w', parameters: {},
      execute: async () => { executed++; return { content: 'ok' }; },
    });

    let call = 0;
    const provider: LLMProvider = {
      async *streamChat(_m: Message[], _t: ToolDef[], _s: string, _mt: number): AsyncGenerator<LLMEvent> {
        if (call++ === 0) {
          yield { type: 'tool_use', id: 't1', name: 'write', input: {}, argsError: 'arguments truncated at the output token limit (max_tokens)' } as any;
        } else {
          yield { type: 'text', text: 'recovered' };
        }
        yield { type: 'done' };
      },
    };

    const history = new ConversationHistory();
    const events: LLMEvent[] = [];
    const loop = new AgentLoop(provider, registry, [], 8192, 'm', 'p');
    await loop.run(history, 'go', (e) => events.push(e));

    // The broken call must never reach the tool.
    expect(executed).toBe(0);

    // The model gets an error result that names the cause and the way out.
    const result = events.find((e) => e.type === 'tool_result') as any;
    expect(result.isError).toBe(true);
    expect(result.result).toMatch(/truncat|max_tokens/i);
    expect(result.result).toMatch(/smaller|split/i);

    // And the loop continued to the next turn instead of aborting.
    expect(events.some((e) => e.type === 'text' && (e as any).text === 'recovered')).toBe(true);
  });
});
