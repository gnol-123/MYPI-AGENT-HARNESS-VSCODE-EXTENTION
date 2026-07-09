import * as vscode from 'vscode';
import { AgentLoop } from '../agent/loop';
import { LLMEvent } from '../providers/types';

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

      case 'userMessage': {
        const text = message.text as string;
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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); font-size: var(--vscode-font-size, 13px); color: var(--vscode-foreground, #cdd6f4); background: var(--vscode-sideBar-background, #1e1e2e); height: 100vh; overflow: hidden; }
    #root { height: 100%; display: flex; flex-direction: column; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground, #a6adc8); font-size: 13px; flex-direction: column; gap: 12px; }
    #loading .spinner { width: 24px; height: 24px; border: 2px solid var(--vscode-input-border, #45475a); border-top-color: #cba6f7; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #error-screen { display: none; align-items: center; justify-content: center; height: 100%; flex-direction: column; gap: 8px; padding: 24px; text-align: center; }
    #error-screen .err-title { color: #f38ba8; font-weight: 600; font-size: 14px; }
    #error-screen .err-msg { color: var(--vscode-descriptionForeground, #a6adc8); font-size: 12px; line-height: 1.5; }
    .session-tab { display: flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; background: transparent; border: 1px solid transparent; color: var(--vscode-descriptionForeground); }
    .session-tab.active { background: var(--vscode-tab-activeBackground); color: var(--vscode-tab-activeForeground); border-color: var(--vscode-tab-activeBorderTop, #cba6f7); }
    .session-tab:hover:not(.active) { background: var(--vscode-toolbar-hoverBackground); }
    .session-tab .close-btn { opacity: 0; font-size: 10px; line-height: 1; cursor: pointer; padding: 0 2px; }
    .session-tab:hover .close-btn { opacity: 0.6; }
    .session-tab .close-btn:hover { opacity: 1; color: #f38ba8; }
    .session-tabs { display: flex; gap: 2px; overflow-x: auto; padding: 4px 4px 0; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); scrollbar-width: none; }
    .session-tabs::-webkit-scrollbar { display: none; }
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
