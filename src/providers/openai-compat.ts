import { LLMProvider, LLMEvent, Message, ToolDef } from './types';

interface OpenAICompatConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

function convertMessages(messages: Message[]): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
    } else {
      const toolCalls: Array<Record<string, unknown>> = [];
      const toolResults: Array<Record<string, unknown>> = [];
      const textParts: string[] = [];

      for (const part of msg.content) {
        if (part.type === 'text') {
          textParts.push(part.text ?? '');
        } else if (part.type === 'tool_use') {
          toolCalls.push({
            id: part.id,
            type: 'function',
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input),
            },
          });
        } else if (part.type === 'tool_result') {
          toolResults.push({
            role: 'tool',
            tool_call_id: part.tool_use_id,
            content: part.content ?? '',
          });
        }
      }

      if (toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: textParts.join('\n') || null,
          tool_calls: toolCalls,
        });
        // Tool results must come AFTER the assistant message with tool_calls
        for (const tr of toolResults) {
          result.push(tr);
        }
      } else if (textParts.length > 0) {
        result.push({ role: msg.role, content: textParts.join('\n') });
      }
    }
  }

  return result;
}

function convertTools(tools: ToolDef[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

export function createOpenAICompatProvider(config: OpenAICompatConfig): LLMProvider {
  return {
    async *streamChat(
      messages: Message[],
      tools: ToolDef[],
      systemPrompt: string,
      maxTokens: number,
    ): AsyncGenerator<LLMEvent> {
      try {
        const body: Record<string, unknown> = {
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...convertMessages(messages),
          ],
          max_tokens: maxTokens,
          stream: true,
        };

        if (tools.length > 0) {
          body.tools = convertTools(tools);
        }

        const baseUrl = config.baseUrl.replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          yield { type: 'error', message: `HTTP ${response.status}: ${errorText}` };
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          yield { type: 'error', message: 'No response body' };
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta;

              if (delta?.content) {
                yield { type: 'text', text: delta.content };
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index;
                  if (!toolCalls.has(idx)) {
                    toolCalls.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' });
                  }
                  const existing = toolCalls.get(idx)!;
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name = tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                }
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        for (const [, tc] of toolCalls) {
          try {
            const input = JSON.parse(tc.arguments);
            yield { type: 'tool_use', id: tc.id, name: tc.name, input };
          } catch {
            yield { type: 'tool_use', id: tc.id, name: tc.name, input: {} };
          }
        }

        yield { type: 'done' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield { type: 'error', message };
      }
    },
  };
}
