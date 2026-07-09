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

export interface SessionsList {
  type: 'sessionsList';
  sessions: SessionInfo[];
  activeId: string;
}

export interface SessionMessages {
  type: 'sessionMessages';
  sessionId: string;
  messages: Message[];
}

export interface AgentStatus {
  type: 'agentStatus';
  cwd: string;
  model: string;
  provider: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
}

export interface PrefillPrompt {
  type: 'prefillPrompt';
  text: string;
}

export type HostToWebview = AssistantStreamChunk | ToolCallStart | ToolCallResult | AgentError | AgentDone | SessionsList | SessionMessages | PrefillPrompt | AgentStatus;
export type WebviewToHost = UserMessage | { type: 'cancelRequest' } | { type: 'runCommand'; command: string } | { type: 'switchSession'; sessionId: string } | { type: 'newSession' } | { type: 'deleteSession'; sessionId: string } | { type: 'switchModel'; model: string } | { type: 'setCwd'; cwd: string };

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

export interface SessionInfo {
  id: string;
  name: string;
  messageCount: number;
  createdAt: number;
}
