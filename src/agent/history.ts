import { Message, MessageContent } from '../providers/types';

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export class ConversationHistory {
  private messages: Message[] = [];
  private pendingToolCalls: ToolCall[] = [];

  addUserMessage(text: string): void {
    this.messages.push({ role: 'user', content: text });
  }

  addAssistantMessage(text: string, toolCalls?: ToolCall[]): void {
    const content: MessageContent[] = [];

    if (text) {
      content.push({ type: 'text', text });
    }

    if (toolCalls) {
      this.pendingToolCalls = toolCalls;
      for (const tc of toolCalls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
    }

    this.messages.push({
      role: 'assistant',
      content: content.length === 1 && content[0].type === 'text' ? text : content,
    });
  }

  addToolResult(id: string, result: string, isError?: boolean): void {
    const lastMsg = this.messages[this.messages.length - 1];
    if (lastMsg && Array.isArray(lastMsg.content)) {
      lastMsg.content.push({
        type: 'tool_result',
        tool_use_id: id,
        content: result,
        is_error: isError,
      });
    }
    this.pendingToolCalls = this.pendingToolCalls.filter((tc) => tc.id !== id);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getPendingToolCalls(): ToolCall[] {
    return [...this.pendingToolCalls];
  }

  /** Used by compaction to swap old turns for a summary. */
  replaceMessages(messages: Message[]): void {
    this.messages = messages;
  }

  clear(): void {
    this.messages = [];
    this.pendingToolCalls = [];
  }

  toJSON(): Message[] {
    return this.getMessages();
  }

  static fromJSON(messages: Message[]): ConversationHistory {
    const history = new ConversationHistory();
    history.messages = JSON.parse(JSON.stringify(messages));
    return history;
  }
}
