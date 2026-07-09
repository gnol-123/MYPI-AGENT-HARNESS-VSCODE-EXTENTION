import { LLMProvider, LLMEvent, ToolDef, ThinkingEffort } from '../providers/types';
import { ToolRegistry } from '../tools/registry';
import { ConversationHistory } from './history';
import { Skill } from '../skills/loader';
import { buildSystemPrompt } from './system-prompt';
import { setBashCwd, getBashCwd } from '../tools/bash';

const MAX_TOOL_ITERATIONS = 50;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AgentStatus {
  cwd: string;
  model: string;
  provider: string;
  providerKey: string;
  tokenUsage: TokenUsage;
  availableModels: string[];
}

export class AgentLoop {
  private tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  private abortController: AbortController | undefined;

  constructor(
    private provider: LLMProvider,
    private toolRegistry: ToolRegistry,
    private skills: Skill[],
    private maxTokens: number,
    private modelName: string = '',
    private providerName: string = '',
    private providerKey: string = '',
    private availableModels: string[] = [],
    private thinkingEffort: ThinkingEffort = 'low',
  ) {
    // A freshly built provider must agree with the loop's effort from request one.
    this.provider.setThinkingEffort?.(this.thinkingEffort);
  }

  getStatus(): AgentStatus {
    const cwd = getBashCwd();
    return {
      cwd,
      model: this.modelName,
      provider: this.providerName,
      providerKey: this.providerKey,
      tokenUsage: { ...this.tokenUsage },
      availableModels: this.availableModels,
    };
  }

  /**
   * The one place effort is applied. It drives both the system-prompt guidance
   * and the provider's API-level reasoning budget, so the two can never drift.
   */
  setThinkingEffort(effort: ThinkingEffort): void {
    this.thinkingEffort = effort;
    this.provider.setThinkingEffort?.(effort);
  }

  getThinkingEffort(): ThinkingEffort {
    return this.thinkingEffort;
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async run(
    history: ConversationHistory,
    userMessage: string,
    onEvent: (event: LLMEvent) => void,
  ): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    history.addUserMessage(userMessage);

    // The user message is already the last entry in `messages`. Repeating it in
    // the system prompt changes the prompt every turn, which makes the prompt
    // cache miss on every request.
    const systemPrompt = buildSystemPrompt(this.skills, undefined, this.thinkingEffort);
    const toolDefs = this.toolRegistry.getAllToolDefs();
    let iterations = 0;

    try {
      while (iterations < MAX_TOOL_ITERATIONS) {
        if (signal.aborted) break;
        iterations++;

        const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
        let currentText = '';

        let stream: AsyncIterable<LLMEvent> | undefined;
        let retries = 0;

        // Retry loop for network errors
        while (true) {
          try {
            stream = this.provider.streamChat(
              history.getMessages(),
              toolDefs,
              systemPrompt,
              this.maxTokens,
            );
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const isNetwork = msg.includes('fetch') || msg.includes('network') ||
              msg.includes('ECONN') || msg.includes('ETIMEDOUT') ||
              msg.includes('aborted') || msg.includes('429') ||
              msg.includes('503') || msg.includes('502');

            if (isNetwork && retries < MAX_RETRIES) {
              retries++;
              const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retries - 1);
              onEvent({ type: 'error', message: `Network error (retry ${retries}/${MAX_RETRIES} in ${delay / 1000}s)...` });
              await new Promise((r) => setTimeout(r, delay));
              if (signal.aborted) break;
            } else {
              throw err;
            }
          }
        }

        if (!stream) break;

        try {
          for await (const event of stream) {
            if (signal.aborted) break;

            if (event.type === 'stream_start' || event.type === 'tool_use_start') {
              // Progress only — never becomes history or a tool invocation.
              onEvent(event);
            } else if (event.type === 'text') {
              currentText += event.text;
              onEvent(event);
            } else if (event.type === 'thinking') {
              onEvent(event);
            } else if (event.type === 'usage') {
              this.tokenUsage.inputTokens += event.inputTokens;
              this.tokenUsage.outputTokens += event.outputTokens;
              this.tokenUsage.cacheReadTokens += event.cacheReadTokens ?? 0;
              this.tokenUsage.cacheWriteTokens += event.cacheWriteTokens ?? 0;
              onEvent(event);
            } else if (event.type === 'tool_use') {
              toolCalls.push({ id: event.id, name: event.name, input: event.input });
            } else if (event.type === 'error') {
              onEvent(event);
              return;
            }
          }
        } catch (streamErr) {
          const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          const isNetwork = msg.includes('fetch') || msg.includes('network') ||
            msg.includes('ECONN') || msg.includes('ETIMEDOUT') ||
            msg.includes('aborted') || msg.includes('429') ||
            msg.includes('503') || msg.includes('502');

          if (isNetwork && retries < MAX_RETRIES) {
            retries++;
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retries - 1);
            onEvent({ type: 'error', message: `Stream error (retry ${retries}/${MAX_RETRIES} in ${delay / 1000}s)...` });
            await new Promise((r) => setTimeout(r, delay));
            if (!signal.aborted) continue;
            break;
          }
          // Save whatever partial text we have before throwing
          if (currentText || toolCalls.length > 0) {
            history.addAssistantMessage(
              currentText + (msg.includes('network') ? `\n\n[Connection lost: ${msg}]` : ''),
              toolCalls.length > 0 ? toolCalls : undefined,
            );
          }
          throw streamErr;
        }

        // A thinking-only turn may produce no visible output text - the model
        // spent its whole budget on reasoning. Don't store an empty message,
        // but DO signal completion so the webview knows it's done.
        if (currentText || toolCalls.length > 0) {
          history.addAssistantMessage(
            currentText,
            toolCalls.length > 0 ? toolCalls : undefined,
          );
        }

        if (toolCalls.length === 0) {
          return;
        }

        for (const tc of toolCalls) {
          if (signal.aborted) break;
          onEvent({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });

          try {
            const result = await this.toolRegistry.execute(tc.name, tc.input);
            const resultText = result.error
              ? `Error: ${result.error}`
              : result.content;

            onEvent({
              type: 'tool_result',
              id: tc.id,
              result: resultText + (result.truncated ? '\n[Output truncated]' : ''),
              truncated: result.truncated,
              isError: !!result.error,
            });

            history.addToolResult(
              tc.id,
              resultText + (result.truncated ? '\n[Output truncated]' : ''),
              !!result.error,
            );
          } catch (err) {
            const errMsg = `Error: ${err instanceof Error ? err.message : String(err)}`;
            onEvent({
              type: 'tool_result',
              id: tc.id,
              result: errMsg,
              isError: true,
            });
            history.addToolResult(tc.id, errMsg, true);
          }
        }
      }
      // Loop ended — either tasks complete or hit max iterations
      if (iterations >= MAX_TOOL_ITERATIONS) {
        onEvent({ type: 'text', text: `\n\n*(Reached max ${MAX_TOOL_ITERATIONS} tool iterations — task may be incomplete)*` });
      }
    } finally {
      this.abortController = undefined;
    }
  }
}
