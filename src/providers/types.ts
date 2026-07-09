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
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; result: string; truncated?: boolean; isError?: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface LLMProvider {
  streamChat(
    messages: Message[],
    tools: ToolDef[],
    systemPrompt: string,
    maxTokens: number,
  ): AsyncGenerator<LLMEvent>;
  /** Enable or disable API-level chain-of-thought thinking */
  setThinkingEnabled?(enabled: boolean): void;
}
