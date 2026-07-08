export interface UserMessage {
  type: 'userMessage';
  text: string;
  attachments?: string[];
}

export interface AssistantStreamChunk {
  type: 'assistantStreamChunk';
  text: string;
}

export interface ToolCallStart {
  type: 'toolCallStart';
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface ToolCallResult {
  type: 'toolCallResult';
  id: string;
  result: string;
  truncated?: boolean;
}

export interface AgentError {
  type: 'error';
  message: string;
  retryable: boolean;
}

export interface AgentDone {
  type: 'done';
  turnId: string;
}

export type HostToWebview = AssistantStreamChunk | ToolCallStart | ToolCallResult | AgentError | AgentDone;
export type WebviewToHost = UserMessage | { type: 'cancelRequest' };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallEntry[];
  timestamp: number;
}

export interface ToolCallEntry {
  id: string;
  name: string;
  params: Record<string, unknown>;
  result?: string;
  truncated?: boolean;
}
