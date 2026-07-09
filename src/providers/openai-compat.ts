import { LLMProvider, LLMEvent, Message, ToolDef } from './types';

interface OpenAICompatConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Provider key ('z-ai', 'deepseek', ...) — reasoning params differ per API. */
  providerKey?: string;
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
  /** Request timeout in ms (default 120s). */
  timeoutMs?: number;
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

        // Reasoning control, mirroring PI's defaultThinkingLevel.
        // Z.AI and DeepSeek use `thinking: { type: enabled|disabled }`.
        if (config.providerKey === 'z-ai' || config.providerKey === 'deepseek') {
          const level = config.thinkingLevel ?? 'high';
          body.thinking = { type: level === 'off' ? 'disabled' : 'enabled' };
        }

        if (tools.length > 0) {
          body.tools = convertTools(tools);
        }

        const baseUrl = config.baseUrl.replace(/\/$/, '');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? 120_000);
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
          let errorText = await response.text();
          // HTML error pages (nginx etc.) are noise — report the URL instead.
          if (errorText.trimStart().startsWith('<')) {
            errorText = `${baseUrl}/chat/completions — the endpoint URL or model may be wrong. Check the provider/apiEndpoint settings.`;
          }
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
              // Z.AI wraps chunks in { data: { ... } }; standard OpenAI-compat sends { choices: [...] }
              const choices: any[] = parsed.choices ?? parsed.data?.choices ?? [];
              if (parsed.usage) {
                yield {
                  type: 'usage',
                  inputTokens: parsed.usage.prompt_tokens ?? 0,
                  outputTokens: parsed.usage.completion_tokens ?? 0,
                };
              }
              const choice = choices[0];
              if (!choice) continue;

              const delta = choice.delta;

              if (delta?.reasoning_content) {
                yield { type: 'thinking', text: delta.reasoning_content };
              }

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
      } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err);
        if (err?.name === 'AbortError' || message.includes('abort') || message.includes('timeout')) {
          yield { type: 'error', message: 'Request timed out. The model may be thinking too long -- try lowering your thinking level or sending a shorter prompt.' };
        } else if (message.includes('fetch') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED') || message.includes('Failed to fetch')) {
          yield { type: 'error', message: `Network error: cannot reach ${config.baseUrl}. Check your connection and the provider endpoint URL.\n\n${message}` };
        } else {
          yield { type: 'error', message: `API error: ${message}` };
        }
      }
    },
  };
}
