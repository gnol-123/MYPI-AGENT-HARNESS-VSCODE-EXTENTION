export interface Message {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
}

export interface MessageContent {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type LLMEvent =
  // Progress signals. A tool-calling turn produces no text or thinking, so
  // without these the UI has nothing to render until the turn is over.
  | { type: 'stream_start' }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  // Exactly one per request. Providers report usage cumulatively, often on
  // several chunks, so a provider must emit only its final tally.
  | { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; result: string; truncated?: boolean; isError?: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

/** UI effort levels. `low` means no API-level reasoning at all. */
export type ThinkingEffort = 'low' | 'medium' | 'high';

export interface LLMProvider {
  streamChat(
    messages: Message[],
    tools: ToolDef[],
    systemPrompt: string,
    maxTokens: number,
  ): AsyncGenerator<LLMEvent>;
  /**
   * Sets API-level chain-of-thought depth. Read at request time, so a change
   * takes effect on the next request without rebuilding the provider.
   */
  setThinkingEffort?(effort: ThinkingEffort): void;
}
