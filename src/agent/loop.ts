import { LLMProvider, LLMEvent, ToolDef } from '../providers/types';
import { ToolRegistry } from '../tools/registry';
import { ConversationHistory } from './history';
import { Skill } from '../skills/loader';
import { buildSystemPrompt } from './system-prompt';

const MAX_TOOL_ITERATIONS = 25;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AgentStatus {
  cwd: string;
  model: string;
  provider: string;
  tokenUsage: TokenUsage;
}

export class AgentLoop {
  private tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  constructor(
    private provider: LLMProvider,
    private toolRegistry: ToolRegistry,
    private skills: Skill[],
    private maxTokens: number,
    private modelName: string = '',
    private providerName: string = '',
  ) {}

  getStatus(): AgentStatus {
    return {
      cwd: process.cwd(),
      model: this.modelName,
      provider: this.providerName,
      tokenUsage: { ...this.tokenUsage },
    };
  }

  async run(
    userMessage: string,
    onEvent: (event: LLMEvent) => void,
  ): Promise<void> {
    const history = new ConversationHistory();
    history.addUserMessage(userMessage);

    const systemPrompt = buildSystemPrompt(this.skills, userMessage);
    const toolDefs = this.toolRegistry.getAllToolDefs();
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let currentText = '';

      const stream = this.provider.streamChat(
        history.getMessages(),
        toolDefs,
        systemPrompt,
        this.maxTokens,
      );

      for await (const event of stream) {
        if (event.type === 'text') {
          currentText += event.text;
          onEvent(event);
        } else if (event.type === 'tool_use') {
          toolCalls.push({ id: event.id, name: event.name, input: event.input });
        } else if (event.type === 'error') {
          onEvent(event);
          return;
        }
      }

      history.addAssistantMessage(
        currentText,
        toolCalls.length > 0 ? toolCalls : undefined,
      );

      if (toolCalls.length === 0) {
        return;
      }

      for (const tc of toolCalls) {
        onEvent({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });

        try {
          const result = await this.toolRegistry.execute(tc.name, tc.input);
          const resultText = result.error
            ? `Error: ${result.error}`
            : result.content;

          history.addToolResult(
            tc.id,
            resultText + (result.truncated ? '\n[Output truncated]' : ''),
            !!result.error,
          );
        } catch (err) {
          history.addToolResult(
            tc.id,
            `Error: ${err instanceof Error ? err.message : String(err)}`,
            true,
          );
        }
      }
    }
  }
}
