import * as vscode from 'vscode';
import { AgentLoop } from '../agent/loop';
import { LLMEvent } from '../providers/types';
import { setBashCwd } from '../tools/bash';

interface StoredSession {
  id: string;
  name: string;
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }>;
  createdAt: number;
}

interface SessionInfo {
  id: string;
  name: string;
  messageCount: number;
  createdAt: number;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static currentProvider: ChatViewProvider | undefined;
  private view: vscode.WebviewView | undefined;
  private agentLoop: AgentLoop | undefined;
  private extensionUri: vscode.Uri;
  private pendingPrompt: string | undefined;
  private sessions: Map<string, StoredSession> = new Map();
  private activeSessionId: string;
  private globalState: vscode.Memento | undefined;
  public onSwitchModel: ((model: string) => void) | undefined;
  public onRequestAgentLoop: (() => Promise<AgentLoop | undefined>) | undefined;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
    this.activeSessionId = this.generateId();
  }

  setState(state: vscode.Memento): void {
    this.globalState = state;
    this.loadSessions();
  }

  setAgentLoop(agentLoop: AgentLoop): void {
    this.agentLoop = agentLoop;
    this.sendStatus();
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

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      this.handleMessage(message);
    });

    // Send sessions list after a short delay to let webview initialize
    setTimeout(() => this.sendSessionsList(), 100);

    if (this.pendingPrompt) {
      setTimeout(() => {
        this.postMessage({ type: 'prefillPrompt', text: this.pendingPrompt! });
        this.pendingPrompt = undefined;
      }, 200);
    } else if (!this.agentLoop) {
      setTimeout(() => {
        this.postMessage({
          type: 'error',
          message: 'Welcome to MYPI-by-SL! Run "MYPI-by-SL: Set API Key" from the command palette (Ctrl+Shift+P).',
          retryable: false,
        });
      }, 500);
    }
  }

  static postToWebview(message: Record<string, unknown>): void {
    ChatViewProvider.currentProvider?.postMessage(message);
  }

  private postMessage(message: Record<string, unknown>): void {
    this.view?.webview.postMessage(message);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  private loadSessions(): void {
    if (!this.globalState) return;
    const stored = this.globalState.get<Record<string, StoredSession>>('mypi-sessions');
    if (stored) {
      this.sessions = new Map(Object.entries(stored));
      const keys = Array.from(this.sessions.keys());
      if (keys.length > 0) {
        this.activeSessionId = keys[keys.length - 1];
      }
    } else {
      // Create default session
      this.createSession('Chat 1');
    }
  }

  private saveSessions(): void {
    if (!this.globalState) return;
    const obj: Record<string, StoredSession> = {};
    for (const [k, v] of this.sessions) {
      obj[k] = v;
    }
    this.globalState.update('mypi-sessions', obj);
  }

  private createSession(name: string): string {
    const id = this.generateId();
    this.sessions.set(id, {
      id,
      name,
      messages: [],
      createdAt: Date.now(),
    });
    this.activeSessionId = id;
    this.saveSessions();
    this.sendSessionsList();
    return id;
  }

  private deleteSession(id: string): void {
    if (this.sessions.size <= 1) return; // Keep at least one
    this.sessions.delete(id);
    if (this.activeSessionId === id) {
      const keys = Array.from(this.sessions.keys());
      this.activeSessionId = keys[keys.length - 1];
    }
    this.saveSessions();
    this.sendSessionsList();
    this.sendSessionMessages(this.activeSessionId);
  }

  private getActiveSession(): StoredSession {
    if (!this.sessions.has(this.activeSessionId)) {
      this.createSession('Chat 1');
    }
    return this.sessions.get(this.activeSessionId)!;
  }

  private sendStatus(): void {
    if (this.agentLoop) {
      const status = this.agentLoop.getStatus();
      // Shorten cwd for display
      const home = process.env.HOME || process.env.USERPROFILE || '';
      if (home && status.cwd.startsWith(home)) {
        status.cwd = '~' + status.cwd.slice(home.length);
      }
      this.postMessage({ type: 'agentStatus', ...status });
    }
  }

  private sendSessionsList(): void {
    const infos: SessionInfo[] = Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      name: s.name,
      messageCount: s.messages.length,
      createdAt: s.createdAt,
    }));
    this.postMessage({
      type: 'sessionsList',
      sessions: infos,
      activeId: this.activeSessionId,
    });
    this.sendSessionMessages(this.activeSessionId);
  }

  private sendSessionMessages(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.postMessage({
      type: 'sessionMessages',
      sessionId,
      messages: session.messages,
    });
  }

  private addMessageToSession(role: 'user' | 'assistant', content: string): void {
    const session = this.getActiveSession();
    session.messages.push({
      id: this.generateId(),
      role,
      content,
      timestamp: Date.now(),
    });
    // Update session name from first user message
    if (role === 'user' && session.messages.filter((m) => m.role === 'user').length === 1) {
      session.name = content.slice(0, 30) + (content.length > 30 ? '...' : '');
    }
    this.saveSessions();
    this.sendSessionsList();
  }

  private async handleMessage(message: Record<string, unknown>): Promise<void> {
    switch (message.type) {
      case 'runCommand': {
        const cmd = message.command as string;
        vscode.commands.executeCommand(cmd);
        break;
      }

      case 'newSession': {
        const count = this.sessions.size + 1;
        this.createSession(`Chat ${count}`);
        this.sendSessionMessages(this.activeSessionId);
        break;
      }

      case 'switchSession': {
        const sessionId = message.sessionId as string;
        if (this.sessions.has(sessionId)) {
          this.activeSessionId = sessionId;
          this.sendSessionsList();
        }
        break;
      }

      case 'deleteSession': {
        const sessionId = message.sessionId as string;
        this.deleteSession(sessionId);
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

      case 'userMessage': {
        const text = message.text as string;
        if (!this.agentLoop && this.onRequestAgentLoop) {
          await this.onRequestAgentLoop();
        }
        if (!this.agentLoop) {
          this.postMessage({
            type: 'error',
            message: 'No API key configured. Run "MYPI-by-SL: Set API Key" from the command palette (Ctrl+Shift+P).',
            retryable: false,
          });
          return;
        }

        this.addMessageToSession('user', text);

        this.postMessage({
          type: 'userMessageEcho',
          text,
          id: Date.now().toString(),
        });

        let fullResponse = '';

        await this.agentLoop.run(text, (event: LLMEvent) => {
          switch (event.type) {
            case 'text':
              fullResponse += event.text;
              this.postMessage({ type: 'assistantStreamChunk', text: event.text });
              break;
            case 'tool_use':
              this.postMessage({
                type: 'toolCallStart',
                id: event.id,
                name: event.name,
                params: event.input,
              });
              break;
            case 'error':
              fullResponse += `\nError: ${event.message}`;
              this.postMessage({
                type: 'error',
                message: event.message,
                retryable: true,
              });
              break;
            case 'done':
              this.postMessage({ type: 'done', turnId: Date.now().toString() });
              this.sendStatus();
              break;
          }
        });

        if (fullResponse) {
          this.addMessageToSession('assistant', fullResponse);
        }
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
    @keyframes toolPulse { 0%, 100% { box-shadow: 0 0 4px currentColor; } 50% { box-shadow: 0 0 14px currentColor; } }
    @keyframes popIn { from { opacity: 0; transform: translateY(4px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
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
    .mypi-tool-card.executing .mypi-tool-dot { animation: toolPulse 1.5s ease-in-out infinite; }
    .mypi-tool-name { font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; }
    .mypi-tool-name.read { color: var(--mypi-blue); }
    .mypi-tool-name.write { color: var(--mypi-green); }
    .mypi-tool-name.edit { color: var(--mypi-yellow); }
    .mypi-tool-name.bash { color: var(--mypi-teal); }
    .mypi-tool-name.context7 { color: var(--mypi-mauve); }
    .mypi-tool-params { color: var(--vscode-descriptionForeground); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; font-family: var(--vscode-editor-font-family, monospace); }
    .mypi-tool-result { margin-top: 4px; padding: 5px 7px; background: color-mix(in srgb, var(--vscode-textCodeBlock-background, #1e1e2e) 60%, transparent); border-radius: 3px; font-family: var(--vscode-editor-font-family, monospace); font-size: 10.5px; white-space: pre-wrap; word-break: break-all; max-height: 140px; overflow-y: auto; color: var(--vscode-descriptionForeground); line-height: 1.45; }

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
