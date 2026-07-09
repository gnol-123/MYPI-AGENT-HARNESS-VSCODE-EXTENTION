export interface UserMessage {
  type: 'userMessage';
  text: string;
  sessionId: string;
  attachments?: string[];
}

export interface AssistantStreamChunk {
  type: 'assistantStreamChunk';
  text: string;
  sessionId: string;
}

export interface ToolCallStart {
  type: 'toolCallStart';
  id: string;
  sessionId: string;
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
  sessionId?: string;
}

export interface AgentDone {
  type: 'done';
  turnId: string;
  sessionId: string;
}

export interface ThinkingChunk {
  type: 'thinking';
  sessionId: string;
  text: string;
}

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  lastContextTokens: number;
}

export interface SessionUsageMsg {
  type: 'sessionUsage';
  sessionId: string;
  usage: SessionUsage;
  contextPct: number;
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
  availableModels?: string[];
}

export interface PrefillPrompt {
  type: 'prefillPrompt';
  text: string;
}

export type AgentDotState = 'idle' | 'working' | 'found' | 'done' | 'failed';

export interface StatusDotMsg {
  type: 'statusDot';
  state: AgentDotState;
  sessionId: string;
}

export interface AbortConfirmMsg {
  type: 'abortConfirm';
  sessionId: string;
}

export interface NetworkErrorMsg {
  type: 'networkError';
  message: string;
  sessionId: string;
}

export interface NetworkReconnectedMsg {
  type: 'networkReconnected';
  sessionId: string;
}

export interface QueueStatusMsg {
  type: 'queueStatus';
  sessionId: string;
  count: number;
}

export interface ThinkingEffortMsg {
  type: 'thinkingEffort';
  effort: 'low' | 'medium' | 'high';
}

export type HostToWebview = AssistantStreamChunk | ToolCallStart | ToolCallResult | AgentError | AgentDone | SessionsList | SessionMessages | PrefillPrompt | AgentStatus
  | ThinkingChunk
  | SessionUsageMsg
  | StatusDotMsg
  | AbortConfirmMsg
  | NetworkErrorMsg
  | NetworkReconnectedMsg
  | QueueStatusMsg
  | ThinkingEffortMsg;
export type WebviewToHost = UserMessage | { type: 'cancelRequest'; sessionId: string } | { type: 'runCommand'; command: string } | { type: 'switchSession'; sessionId: string } | { type: 'newSession' } | { type: 'deleteSession'; sessionId: string } | { type: 'switchModel'; model: string } | { type: 'setCwd'; cwd: string } | { type: 'clearSession'; sessionId: string } | { type: 'retryPrompt'; sessionId: string; text: string } | { type: 'setThinkingEffort'; effort: 'low' | 'medium' | 'high' };

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
  updatedAt: number;
  usage?: SessionUsage;
}
