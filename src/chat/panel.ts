import * as vscode from 'vscode';
import { AgentLoop } from '../agent/loop';
import { LLMEvent, ThinkingEffort } from '../providers/types';
import { setBashCwd } from '../tools/bash';
import { SessionManager, Session } from './session-manager';
import { costUsd, contextWindowFor } from '../pricing';
import { parseTodos } from '../tools/todo';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static currentProvider: ChatViewProvider | undefined;
  private view: vscode.WebviewView | undefined;
  private agentLoop: AgentLoop | undefined;
  private extensionUri: vscode.Uri;
  private pendingPrompt: string | undefined;
  private sessionManager = new SessionManager();
  /** Set of sessions currently running the agent loop */
  private runningSessions = new Set<string>();
  /** Per-session queue of prompt text waiting to run after the current one */
  private sessionQueues = new Map<string, string[]>();
  public onSwitchModel: ((model: string) => void) | undefined;
  public onRequestAgentLoop: (() => Promise<AgentLoop | undefined>) | undefined;
  /** Current thinking effort; 'low' disables API-level reasoning. */
  private thinkingEffort: ThinkingEffort = 'low';

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  setThinkingEffort(effort: ThinkingEffort): void {
    this.thinkingEffort = effort;
    // AgentLoop applies it to the provider too, so there is one path only.
    this.agentLoop?.setThinkingEffort(effort);
    this.postMessage({ type: 'thinkingEffort', effort });
  }

  setState(state: vscode.Memento): void {
    this.sessionManager = new SessionManager(state);
    this.sessionManager.load();
  }

  setAgentLoop(agentLoop: AgentLoop): void {
    this.agentLoop = agentLoop;
    // A loop rebuilt for a model switch starts at its own default, which would
    // silently discard the effort the user picked.
    agentLoop.setThinkingEffort(this.thinkingEffort);
    this.sendStatus();
    this.postMessage({ type: 'thinkingEffort', effort: this.thinkingEffort });
  }

  setPendingPrompt(text: string): void {
    this.pendingPrompt = text;
    if (this.view) {
      this.postMessage({ type: 'prefillPrompt', text });
      this.pendingPrompt = undefined;
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    ChatViewProvider.currentProvider = this;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'webview')],
    };
    // Keep webview alive when user switches tabs
    (webviewView as any).webview.options.retainContextWhenHidden = true;

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message);
    });
  }

  static postToWebview(message: Record<string, unknown>): void {
    ChatViewProvider.currentProvider?.postMessage(message);
  }

  private postMessage(message: Record<string, unknown>): void {
    this.view?.webview.postMessage(message);
  }

  private perfChannel: vscode.OutputChannel | undefined;

  /** Stage-timing log ("MYPI Perf" output channel) for diagnosing latency. */
  private perf(line: string): void {
    if (!this.perfChannel) {
      this.perfChannel = vscode.window.createOutputChannel('MYPI Perf');
    }
    this.perfChannel.appendLine(`${new Date().toISOString()} ${line}`);
  }

  private sendStatus(): void {
    if (this.agentLoop) {
      const status = this.agentLoop.getStatus();
      const home = process.env.HOME || process.env.USERPROFILE || '';
      if (home && status.cwd.startsWith(home)) {
        status.cwd = '~' + status.cwd.slice(home.length);
      }
      this.postMessage({ type: 'agentStatus', ...status });
    }
  }

  private sendSessionsList(): void {
    this.postMessage({
      type: 'sessionsList',
      sessions: this.sessionManager.list(),
      activeId: this.sessionManager.activeId,
    });
    this.sendSessionMessages(this.sessionManager.activeId);
  }

  private sendSessionMessages(sessionId: string): void {
    const session = this.sessionManager.get(sessionId);
    if (!session) return;
    this.postMessage({
      type: 'sessionMessages',
      sessionId,
      messages: session.messages,
    });
  }

  private async runInSession(session: Session, text: string): Promise<void> {
    this.runningSessions.add(session.id);
    this.sessionManager.addMessage(session.id, 'user', text);
    this.sendSessionsList();

    // Signal working status
    this.postMessage({ type: 'statusDot', state: 'working', label: 'Starting...', sessionId: session.id });

    let fullResponse = '';
    let thinkingText = '';
    let aborted = false;
    // The status label only needs posting when it changes. Posting it per token
    // doubles the IPC traffic of a stream for no visible benefit.
    let writingLabelSent = false;
    let thinkingLabelSent = false;
    let foundFlashSent = false;
    // todo_write calls render as the checklist, not tool cards; remember their
    // ids so their tool_results don't try to resolve a card that never existed.
    const todoCallIds = new Set<string>();

    // Stage timing: "it's slow" is only fixable when we can see WHICH stage is
    // slow. Every turn logs first-byte latency to the "MYPI Perf" output channel.
    const t0 = Date.now();
    let turnStart = t0;
    const histMsgs = session.history.getMessages();
    const histChars = JSON.stringify(histMsgs).length;
    this.perf(`[send] session=${session.id} historyMessages=${histMsgs.length} historyChars=${histChars}`);

    try {
      await this.agentLoop!.run(session.history, text, (event: LLMEvent) => {
        switch (event.type) {
          case 'stream_start':
            // First byte back from the model. Replaces the webview's optimistic
            // "Starting..." even when the turn is a tool call with no text.
            // Fires once per turn, so it also resets the per-turn label latches.
            this.perf(`[first-byte] +${Date.now() - turnStart}ms (t+${Date.now() - t0}ms total)`);
            writingLabelSent = false;
            thinkingLabelSent = false;
            this.postMessage({ type: 'statusDot', state: 'working', label: 'Thinking...', sessionId: session.id });
            break;
          case 'tool_use_start':
            // Writing the plan is not "finding the solution" — don't burn the
            // green flash on todo_write.
            if (event.name === 'todo_write') {
              this.postMessage({ type: 'statusDot', state: 'working', label: 'Planning tasks...', sessionId: session.id });
              break;
            }
            // First tool of the run keeps the "Found solution!" green flash the
            // __FOUND_SOLUTION__ text sentinel used to deliver (removed: it
            // polluted the text event channel and every text-event consumer
            // had to know to filter it).
            if (!foundFlashSent) {
              foundFlashSent = true;
              this.postMessage({ type: 'statusDot', state: 'found', label: 'Found solution!', sessionId: session.id });
            } else {
              this.postMessage({ type: 'statusDot', state: 'working', label: `Preparing ${event.name}...`, sessionId: session.id });
            }
            break;
          case 'text':
            fullResponse += event.text;
            this.postMessage({
              type: 'assistantStreamChunk',
              text: event.text,
              sessionId: session.id,
            });
            if (!writingLabelSent) {
              writingLabelSent = true;
              this.postMessage({ type: 'statusDot', state: 'working', label: 'Writing response...', sessionId: session.id });
            }
            break;
          case 'thinking':
            thinkingText += event.text;
            this.postMessage({ type: 'thinking', sessionId: session.id, text: event.text });
            if (!thinkingLabelSent) {
              thinkingLabelSent = true;
              this.postMessage({ type: 'statusDot', state: 'working', label: 'Thinking...', sessionId: session.id });
            }
            break;
          case 'usage': {
            this.perf(`[usage] in=${event.inputTokens} out=${event.outputTokens} cacheRead=${event.cacheReadTokens ?? 0} cacheWrite=${event.cacheWriteTokens ?? 0}`);
            // Price at the model that served this request, not whatever is
            // selected later — switching models mid-session must not reprice
            // earlier requests.
            const model = this.agentLoop!.getStatus().model;
            const turn = {
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              cacheReadTokens: event.cacheReadTokens ?? 0,
              cacheWriteTokens: event.cacheWriteTokens ?? 0,
            };
            const window = contextWindowFor(model);
            this.sessionManager.addUsage(session.id, turn, costUsd(model, turn), window);
            const usage = this.sessionManager.get(session.id)!.usage;
            this.postMessage({
              type: 'sessionUsage',
              sessionId: session.id,
              usage,
              contextPct: Math.min(100, (usage.lastContextTokens / window) * 100),
              contextWindow: window,
              costKnown: usage.unpricedRequests === 0,
            });
            break;
          }
          case 'tool_use':
            // todo_write renders as the pinned checklist, not a tool card.
            if (event.name === 'todo_write') {
              todoCallIds.add(event.id);
              const items = parseTodos(event.input);
              if (items) {
                this.postMessage({ type: 'todos', items, sessionId: session.id });
                this.postMessage({ type: 'statusDot', state: 'working', label: 'Updating tasks...', sessionId: session.id });
              }
              break;
            }
            this.postMessage({
              type: 'toolCallStart',
              id: event.id,
              name: event.name,
              params: event.input,
              sessionId: session.id,
            });
            this.postMessage({ type: 'statusDot', state: 'working', label: `Running ${event.name}...`, sessionId: session.id });
            break;
          case 'tool_result':
            // The next model turn's request goes out right after the last tool
            // result, so this is the reference point for its first-byte time.
            turnStart = Date.now();
            // todo_write has no tool card to resolve.
            if (todoCallIds.has(event.id)) break;
            this.postMessage({
              type: 'toolCallResult',
              id: event.id,
              result: event.result,
              truncated: event.truncated,
              isError: event.isError,
              sessionId: session.id,
            });
            // Orange blinking for errors, green flash for success
            if (event.isError) {
              this.postMessage({ type: 'statusDot', state: 'issue', label: 'Issue encountered', sessionId: session.id });
            } else {
              this.postMessage({ type: 'statusDot', state: 'found', label: 'Found solution!', sessionId: session.id });
            }
            break;
          case 'error':
            this.postMessage({
              type: 'error',
              message: event.message,
              retryable: !!event.message.match(/retry/i),
              sessionId: session.id,
            });
            // Only append genuine errors, not retry notices
            if (!event.message.match(/retry/i)) {
              fullResponse += `\nError: ${event.message}`;
            }
            break;
          case 'done':
            break;
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort') || msg.includes('AbortError')) {
        aborted = true;
        this.postMessage({ type: 'abortConfirm', sessionId: session.id });
        this.postMessage({ type: 'statusDot', state: 'failed', sessionId: session.id });
      } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('ECONN') || msg.includes('ETIMEDOUT')) {
        this.postMessage({ type: 'statusDot', state: 'failed', sessionId: session.id });
        this.postMessage({ type: 'networkError', message: msg, sessionId: session.id });
      } else {
        fullResponse += `\nError: ${msg}`;
        this.postMessage({ type: 'error', message: msg, retryable: true, sessionId: session.id });
        this.postMessage({ type: 'statusDot', state: 'failed', sessionId: session.id });
      }
    } finally {
      this.runningSessions.delete(session.id);
    }

    if (fullResponse || thinkingText) {
      let finalContent = thinkingText
        ? `> ${thinkingText.replace(/\n/g, '\n> ')}\n\n${fullResponse}`
        : fullResponse;
      if (aborted) {
        finalContent = `*[Aborted]*\n\n${finalContent}`;
      }
      this.sessionManager.addMessage(session.id, 'assistant', finalContent);
    }
    this.perf(`[done] total ${Date.now() - t0}ms`);
    this.postMessage({
      type: 'done',
      turnId: Date.now().toString(),
      sessionId: session.id,
    });
    this.postMessage({ type: 'statusDot', state: 'done', sessionId: session.id });
    this.sendStatus();
    this.sendSessionsList();

    // Drain queued messages for this session
    const queue = this.sessionQueues.get(session.id);
    if (queue && queue.length > 0) {
      const nextText = queue.shift()!;
      const remaining = queue.length;
      if (remaining === 0) this.sessionQueues.delete(session.id);
      this.postMessage({ type: 'queueStatus', sessionId: session.id, count: remaining });
      this.sendSessionsList();
      await this.runInSession(session, nextText);
    }
  }

  private async handleMessage(message: Record<string, unknown>): Promise<void> {
    switch (message.type) {
      case 'webviewReady': {
        // Webview is fully initialized — send all session data now
        this.sendSessionsList();
        this.sendStatus();
        // Otherwise the effort buttons show their own default, not the real one.
        this.postMessage({ type: 'thinkingEffort', effort: this.thinkingEffort });
        if (this.pendingPrompt) {
          this.postMessage({ type: 'prefillPrompt', text: this.pendingPrompt });
          this.pendingPrompt = undefined;
        } else if (!this.agentLoop) {
          this.postMessage({
            type: 'error',
            message: 'Welcome to MYPI-by-SL! Run "MYPI-by-SL: Set API Key" from the command palette (Ctrl+Shift+P).',
            retryable: false,
          });
        }
        break;
      }

      case 'runCommand': {
        const cmd = message.command as string;
        vscode.commands.executeCommand(cmd);
        break;
      }

      case 'newSession': {
        this.sessionManager.create();
        this.sendSessionsList();
        break;
      }

      case 'switchSession': {
        const sessionId = message.sessionId as string;
        this.sessionManager.setActive(sessionId);
        this.sendSessionsList();
        // Send queue status for the switched session
        const q = this.sessionQueues.get(sessionId);
        if (q) this.postMessage({ type: 'queueStatus', sessionId, count: q.length });
        break;
      }

      case 'deleteSession': {
        const sessionId = message.sessionId as string;
        this.sessionManager.delete(sessionId);
        this.sessionQueues.delete(sessionId);
        this.sendSessionsList();
        break;
      }

      case 'clearSession': {
        const sessionId = message.sessionId as string;
        this.sessionManager.clear(sessionId);
        this.sessionQueues.delete(sessionId);
        this.postMessage({ type: 'todos', items: [], sessionId });
        this.sendSessionsList();
        break;
      }

      case 'switchModel': {
        const newModel = message.model as string;
        if (this.onSwitchModel) {
          this.onSwitchModel(newModel);
        }
        break;
      }

      case 'setCwd': {
        const newCwd = message.cwd as string;
        setBashCwd(newCwd);
        this.sendStatus();
        break;
      }

      case 'cancelRequest': {
        const sessionId = message.sessionId as string;
        // Abort the running agent loop
        if (this.agentLoop) {
          this.agentLoop.abort();
        }
        // Clear the queue for this session
        this.sessionQueues.delete(sessionId);
        this.postMessage({ type: 'queueStatus', sessionId, count: 0 });
        this.postMessage({ type: 'statusDot', state: 'failed', sessionId });
        this.sendSessionsList();
        break;
      }

      case 'retryPrompt': {
        const sessionId = message.sessionId as string;
        const text = message.text as string;
        const session = this.sessionManager.get(sessionId);
        if (!session) return;
        this.postMessage({ type: 'networkReconnected', sessionId });
        this.postMessage({ type: 'statusDot', state: 'working', sessionId });
        // Need agent loop
        if (!this.agentLoop && this.onRequestAgentLoop) {
          await this.onRequestAgentLoop();
        }
        if (!this.agentLoop) {
          this.postMessage({
            type: 'error',
            message: 'No API key configured. Run "MYPI-by-SL: Set API Key" from the command palette (Ctrl+Shift+P).',
            retryable: false,
            sessionId,
          });
          return;
        }
        await this.runInSession(session, text);
        break;
      }

      case 'setThinkingEffort': {
        this.setThinkingEffort(message.effort as ThinkingEffort);
        break;
      }

      case 'userMessage': {
        const text = message.text as string;
        // Pin to the origin session NOW — activeId may change mid-run.
        const sessionId = (message.sessionId as string) || this.sessionManager.activeId;
        const session = this.sessionManager.get(sessionId);
        if (!session) return;

        if (!this.agentLoop && this.onRequestAgentLoop) {
          await this.onRequestAgentLoop();
        }
        if (!this.agentLoop) {
          this.postMessage({
            type: 'error',
            message: 'No API key configured. Run "MYPI-by-SL: Set API Key" from the command palette (Ctrl+Shift+P).',
            retryable: false,
            sessionId: session.id,
          });
          return;
        }

        if (this.runningSessions.has(session.id)) {
          // Queue the message — don't touch session state, don't interrupt the running stream
          const queue = this.sessionQueues.get(session.id) || [];
          queue.push(text);
          this.sessionQueues.set(session.id, queue);
          this.postMessage({ type: 'queueStatus', sessionId: session.id, count: queue.length });
          return;
        }

        await this.runInSession(session, text);
        break;
      }
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const bundleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'out', 'bundle.js'),
    );

    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; img-src data: ${cspSource};">
  <title>MYPI-by-SL</title>
  <style>
    :root {
      --mypi-accent: #cba6f7;
      --mypi-accent2: #89b4fa;
      --mypi-gradient: linear-gradient(135deg, #89b4fa, #cba6f7);
      --mypi-red: #f38ba8;
      --mypi-green: #a6e3a1;
      --mypi-yellow: #f9e2af;
      --mypi-teal: #94e2d5;
      --mypi-blue: #89b4fa;
      --mypi-mauve: #cba6f7;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); font-size: var(--vscode-font-size, 13px); color: var(--vscode-foreground, #cdd6f4); background: var(--vscode-sideBar-background, #1e1e2e); height: 100vh; overflow: hidden; }
    #root { height: 100%; display: flex; flex-direction: column; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground, #a6adc8); font-size: 13px; flex-direction: column; gap: 12px; }
    #loading .spinner { width: 24px; height: 24px; border: 2px solid var(--vscode-input-border, #45475a); border-top-color: var(--mypi-accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes toolBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
    @keyframes toolNameBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    @keyframes popIn { from { opacity: 0; transform: translateY(4px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes blinkDot { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1); } }
    .mypi-typing { display: flex; align-items: center; gap: 4px; padding: 4px 0; }
    .mypi-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--mypi-accent); animation: blinkDot 1.2s ease-in-out infinite; }
    .mypi-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .mypi-typing-dot:nth-child(3) { animation-delay: 0.4s; }
    .mypi-typing-label { margin-left: 6px; font-size: 10.5px; color: var(--vscode-descriptionForeground, #a6adc8); font-style: italic; }
    #error-screen { display: none; align-items: center; justify-content: center; height: 100%; flex-direction: column; gap: 8px; padding: 24px; text-align: center; }
    #error-screen .err-title { color: var(--mypi-red); font-weight: 600; font-size: 14px; }
    #error-screen .err-msg { color: var(--vscode-descriptionForeground, #a6adc8); font-size: 12px; line-height: 1.5; }

    /* User message bubble with gradient */
    .mypi-msg-user {
      align-self: flex-end;
      background: var(--mypi-gradient);
      color: #fff;
      padding: 8px 12px;
      border-radius: 10px 10px 2px 10px;
      max-width: 85%;
      margin-bottom: 10px;
      font-size: 12.5px;
      line-height: 1.55;
    }
    .mypi-msg-user .mypi-role { color: rgba(255,255,255,0.7); }

    /* Assistant message */
    .mypi-msg-assistant {
      padding: 4px 0;
      margin-bottom: 6px;
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--vscode-foreground);
    }

    /* Role labels */
    .mypi-role {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 3px;
    }
    .mypi-msg-assistant .mypi-role { color: var(--mypi-accent); }

    /* Tool cards */
    .mypi-tool-card {
      margin: 4px 0 4px 4px;
      border-left: 3px solid var(--vscode-textBlockQuote-border, #45475a);
      padding: 5px 8px;
      font-size: 11px;
      border-radius: 0 4px 4px 0;
      background: color-mix(in srgb, var(--vscode-textCodeBlock-background, #45475a) 30%, transparent);
    }
    .mypi-tool-card.executing { border-left-color: var(--mypi-accent); }
    .mypi-tool-header { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
    .mypi-tool-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .mypi-tool-dot.read { background: var(--mypi-blue); color: var(--mypi-blue); }
    .mypi-tool-dot.write { background: var(--mypi-green); color: var(--mypi-green); }
    .mypi-tool-dot.edit { background: var(--mypi-yellow); color: var(--mypi-yellow); }
    .mypi-tool-dot.bash { background: var(--mypi-teal); color: var(--mypi-teal); }
    .mypi-tool-dot.context7 { background: var(--mypi-mauve); color: var(--mypi-mauve); }
    .mypi-tool-card.executing .mypi-tool-dot { animation: toolBlink 0.6s ease-in-out infinite; }
    .mypi-tool-card.executing .mypi-tool-name { animation: toolNameBlink 0.8s ease-in-out infinite; }
    .mypi-tool-name { font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; }
    .mypi-tool-name.read { color: var(--mypi-blue); }
    .mypi-tool-name.write { color: var(--mypi-green); }
    .mypi-tool-name.edit { color: var(--mypi-yellow); }
    .mypi-tool-name.bash { color: var(--mypi-teal); }
    .mypi-tool-name.context7 { color: var(--mypi-mauve); }
    .mypi-tool-params { color: var(--vscode-descriptionForeground); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; font-family: var(--vscode-editor-font-family, monospace); }
    .mypi-tool-result { margin-top: 4px; padding: 5px 7px; background: color-mix(in srgb, var(--vscode-textCodeBlock-background, #1e1e2e) 60%, transparent); border-radius: 3px; font-family: var(--vscode-editor-font-family, monospace); font-size: 10.5px; white-space: pre-wrap; word-break: break-all; max-height: 140px; overflow-y: auto; color: var(--vscode-descriptionForeground); line-height: 1.45; }

    /* Streaming container */
    .mypi-streaming { padding: 4px 0; font-size: 12.5px; line-height: 1.55; color: var(--vscode-foreground); }
    .mypi-cursor-blink { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-descriptionForeground); margin-left: 3px; animation: toolPulse 1s ease-in-out infinite; vertical-align: middle; }

    /* Thinking block — inline, no separate scrollbox */
    .mypi-thinking-block {
      margin: 4px 0 0 4px;
      border-left: 2px solid rgba(203,166,247,0.4);
      padding: 6px 10px;
      font-size: 12px;
      font-style: italic;
      color: #b4b9d0;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Markdown content styles */
    .mypi-md-content p { margin: 0.35em 0; }
    .mypi-md-content p:first-child { margin-top: 0; }
    .mypi-md-content p:last-child { margin-bottom: 0; }
    .mypi-md-content strong { color: var(--vscode-foreground); font-weight: 600; }
    .mypi-md-content em { color: var(--vscode-descriptionForeground); }
    .mypi-md-content code {
      background: var(--vscode-textCodeBlock-background, #313244);
      color: var(--mypi-accent);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
    }
    .mypi-md-content pre {
      background: var(--vscode-textCodeBlock-background, #313244);
      border: 1px solid var(--vscode-input-border, #45475a);
      border-radius: 6px;
      padding: 12px;
      margin: 8px 0;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11.5px;
      line-height: 1.5;
    }
    .mypi-md-content pre code {
      background: none;
      color: var(--vscode-foreground);
      padding: 0;
      font-size: inherit;
    }
    .mypi-md-content ul, .mypi-md-content ol { padding-left: 20px; margin: 4px 0; }
    .mypi-md-content li { margin: 2px 0; }
    .mypi-md-content a { color: var(--mypi-blue); text-decoration: underline; text-underline-offset: 2px; }
    .mypi-md-content blockquote {
      border-left: 2px solid var(--mypi-accent);
      margin: 6px 0;
      padding: 2px 10px;
      color: var(--vscode-descriptionForeground);
    }
    .mypi-md-content h1, .mypi-md-content h2, .mypi-md-content h3 {
      font-weight: 600;
      margin: 10px 0 4px;
      color: var(--vscode-foreground);
    }
    .mypi-md-content h1 { font-size: 15px; }
    .mypi-md-content h2 { font-size: 14px; }
    .mypi-md-content h3 { font-size: 13px; }
    .mypi-md-content hr { border: none; border-top: 1px solid var(--vscode-input-border); margin: 10px 0; }
    .mypi-md-content table { border-collapse: collapse; margin: 8px 0; width: 100%; }
    .mypi-md-content th, .mypi-md-content td {
      border: 1px solid var(--vscode-input-border);
      padding: 6px 10px;
      text-align: left;
      font-size: 12px;
    }
    .mypi-md-content th { background: color-mix(in srgb, var(--vscode-textCodeBlock-background, #313244) 50%, transparent); font-weight: 600; }

    /* Syntax highlight base */
    .mypi-md-content .hljs { background: #313244; color: #cdd6f4; }
    .mypi-md-content .hljs-keyword { color: #cba6f7; }
    .mypi-md-content .hljs-string { color: #a6e3a1; }
    .mypi-md-content .hljs-number { color: #f9e2af; }
    .mypi-md-content .hljs-comment { color: #a6adc8; font-style: italic; }
    .mypi-md-content .hljs-function .hljs-title { color: #89b4fa; }
    .mypi-md-content .hljs-built_in { color: #94e2d5; }
    .mypi-md-content .hljs-params { color: #f5c2e7; }
    .mypi-md-content .hljs-literal { color: #f38ba8; }
    .mypi-md-content .hljs-type { color: #f9e2af; }
    .mypi-md-content .hljs-attr { color: #89b4fa; }
    .mypi-md-content .hljs-variable { color: #cdd6f4; }
    .mypi-md-content .hljs-meta { color: #cba6f7; }
    .mypi-md-content .hljs-selector-class { color: #a6e3a1; }
    .mypi-md-content .hljs-selector-tag { color: #f38ba8; }
    .mypi-md-content .hljs-property { color: #89b4fa; }

    /* Input field glow */
    .mypi-input:focus {
      outline: none;
      border-color: var(--mypi-accent) !important;
      box-shadow: 0 0 0 1px rgba(203,166,247,0.25) !important;
    }

    /* Send button gradient */
    .mypi-send-btn {
      background: var(--mypi-gradient) !important;
      color: #fff !important;
      border: none !important;
      font-weight: 600 !important;
    }
    .mypi-send-btn:hover { opacity: 0.9; }
    .mypi-send-btn:disabled { opacity: 0.4; }

    /* Slash popup */
    .mypi-slash-popup {
      animation: popIn 0.15s ease-out;
    }

    /* Tab underline gradient */
    .mypi-tab.active {
      position: relative;
    }
    .mypi-tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0; right: 0;
      height: 2px;
      background: var(--mypi-gradient);
      border-radius: 1px 1px 0 0;
    }

    /* Status bar dot */
    .mypi-status-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--mypi-green);
      flex-shrink: 0;
    }

    /* Welcome banner */
    .mypi-welcome {
      background: linear-gradient(135deg, rgba(137,180,250,0.08), rgba(203,166,247,0.08));
      border: 1px solid rgba(203,166,247,0.2);
      border-radius: 10px;
    }
  </style>
</head>
<body>
  <div id="root">
    <div id="loading">
      <div class="spinner"></div>
      <div>Loading MYPI-by-SL...</div>
    </div>
  </div>
  <div id="error-screen">
    <div class="err-title">Failed to load chat UI</div>
    <div class="err-msg">Check the VS Code Developer Tools console (Help → Toggle Developer Tools) for errors.</div>
  </div>
  <script>
    window.onerror = function(msg) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('error-screen').style.display = 'flex';
      document.querySelector('.err-msg').textContent += '\\n' + msg;
    };
  </script>
  <script src="${bundleUri}"></script>
</body>
</html>`;
  }
}
