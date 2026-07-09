import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMEvent, Message, ToolDef } from './types';

interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
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

        const stream = client.messages.stream({
          model: config.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: convertedMessages as any,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
        } as any);

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          }
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield { type: 'error', message };
      }
    },
  };
}
