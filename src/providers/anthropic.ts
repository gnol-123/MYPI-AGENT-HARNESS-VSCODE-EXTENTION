import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMEvent, Message, ToolDef } from './types';

interface AnthropicConfig {
  apiKey: string;
  model: string;
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
  /** Request timeout in ms (default 120s). */
  timeoutMs?: number;
}

const THINKING_BUDGETS = { low: 2048, medium: 4096, high: 8192 } as const;

type ConvertedMessage = { role: 'user' | 'assistant'; content: unknown };

/**
 * Marks the tail of the conversation so the growing history is cached too.
 * The previous turn's breakpoint is always a prefix of the next request, so
 * each turn reads the cache instead of reprocessing every earlier message.
 */
function withConversationCacheBreakpoint(messages: ConvertedMessage[]): ConvertedMessage[] {
  if (messages.length === 0) return messages;

  const last = messages[messages.length - 1];
  const blocks = typeof last.content === 'string'
    ? (last.content ? [{ type: 'text' as const, text: last.content }] : [])
    : (last.content as Record<string, unknown>[]).slice();

  // An empty text block is rejected by the API — leave the request untouched.
  if (blocks.length === 0) return messages;

  blocks[blocks.length - 1] = {
    ...blocks[blocks.length - 1],
    cache_control: { type: 'ephemeral' as const },
  };

  const out = messages.slice();
  out[out.length - 1] = { ...last, content: blocks };
  return out;
}

export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  const configuredLevel = config.thinkingLevel ?? 'medium';
  let thinkingEnabled = configuredLevel !== 'off';
  const thinkingBudget = THINKING_BUDGETS[configuredLevel === 'off' ? 'low' : configuredLevel];
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: config.timeoutMs ?? 120_000,
  });

  return {
    setThinkingEnabled(enabled: boolean) {
      thinkingEnabled = enabled;
    },
    async *streamChat(
      messages: Message[],
      tools: ToolDef[],
      systemPrompt: string,
      maxTokens: number,
    ): AsyncGenerator<LLMEvent> {
      try {
        const convertedMessages = messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string'
            ? m.content
            : m.content.map((c) => {
                if (c.type === 'tool_use') {
                  return {
                    type: 'tool_use' as const,
                    id: c.id!,
                    name: c.name!,
                    input: c.input!,
                  };
                }
                if (c.type === 'tool_result') {
                  return {
                    type: 'tool_result' as const,
                    tool_use_id: c.tool_use_id!,
                    content: c.content ?? '',
                    is_error: c.is_error,
                  };
                }
                return { type: 'text' as const, text: c.text ?? '' };
              }),
        }));

        const thinking = thinkingEnabled
          ? { type: 'enabled' as const, budget_tokens: thinkingBudget }
          : undefined;

        let droppedThinking = false;

        // Cache prefix order is tools -> system -> messages, so a single
        // breakpoint on the system block also caches the tool definitions.
        // Every turn of the agent loop resends this whole prefix; without the
        // breakpoint the API reprocesses it from scratch each time.
        const stream = client.messages.stream({
          model: config.model,
          max_tokens: thinking ? Math.max(maxTokens, thinking.budget_tokens + 4096) : maxTokens,
          ...(thinking ? { thinking } : {}),
          system: [
            {
              type: 'text' as const,
              text: systemPrompt,
              cache_control: { type: 'ephemeral' as const },
            },
          ],
          messages: withConversationCacheBreakpoint(convertedMessages) as any,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
        } as any);

        for await (const event of stream) {
          if (event.type === 'message_start') {
            // First byte of the turn. A tool-calling turn emits no text or
            // thinking, so this is the UI's only early progress signal.
            yield { type: 'stream_start' };
          } else if (event.type === 'content_block_start' && (event.content_block as any).type === 'tool_use') {
            // The name and id arrive here; only the arguments stream after.
            const cb = event.content_block as any;
            yield { type: 'tool_use_start', id: cb.id, name: cb.name };
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          } else if (event.type === 'content_block_delta' && (event.delta as any).type === 'thinking_delta') {
            droppedThinking = false;
            yield { type: 'thinking', text: (event.delta as any).thinking ?? '' };
          } else if (event.type === 'content_block_delta' && (event.delta as any).type === 'redacted_thinking') {
            droppedThinking = true;
          }
        }

        if (droppedThinking) {
          yield { type: 'text', text: '\n*(reasoning was redacted by the API)*\n' };
        }

        const finalMessage = await stream.finalMessage();
        for (const block of finalMessage.content) {
          if ((block as any).type === 'tool_use') {
            const tb = block as any;
            yield { type: 'tool_use', id: tb.id, name: tb.name, input: tb.input as Record<string, unknown> };
          }
        }

        if (finalMessage.usage) {
          yield {
            type: 'usage',
            inputTokens: finalMessage.usage.input_tokens ?? 0,
            outputTokens: finalMessage.usage.output_tokens ?? 0,
          };
        }

        yield { type: 'done' };
      } catch (err: any) {
        const status = err?.status ?? err?.statusCode;
        const message = err instanceof Error ? err.message : String(err);
        if (status === 401 || status === 403) {
          yield { type: 'error', message: `Authentication failed (${status}). Check your Anthropic API key.` };
        } else if (status === 429) {
          yield { type: 'error', message: 'Rate limited by Anthropic. Wait a moment and try again.' };
        } else if (message.includes('connect') || message.includes('fetch') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
          yield { type: 'error', message: `Network error: cannot reach Anthropic API. Check your connection.\n\n${message}` };
        } else if (message.includes('timeout') || message.includes('timed out')) {
          yield { type: 'error', message: 'Request timed out. The model may be thinking too long -- try lowering your thinking level or sending a shorter prompt.' };
        } else {
          yield { type: 'error', message: `Anthropic API error:\n\n${message}` };
        }
      }
    },
  };
}
