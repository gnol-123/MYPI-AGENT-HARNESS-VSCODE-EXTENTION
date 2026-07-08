import * as vscode from 'vscode';
import { AgentLoop } from '../agent/loop';
import { LLMEvent } from '../providers/types';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static currentProvider: ChatViewProvider | undefined;
  private view: vscode.WebviewView | undefined;
  private agentLoop: AgentLoop | undefined;
  private extensionUri: vscode.Uri;
  private pendingPrompt: string | undefined;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  setAgentLoop(agentLoop: AgentLoop): void {
    this.agentLoop = agentLoop;
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

    if (this.pendingPrompt) {
      this.postMessage({ type: 'prefillPrompt', text: this.pendingPrompt });
      this.pendingPrompt = undefined;
    } else if (!this.agentLoop) {
      // No agent yet - prompt for API key
      setTimeout(() => {
        this.postMessage({
          type: 'error',
          message: 'Welcome to MYPI-by-SL! To get started, run "MYPI-by-SL: Set API Key" from the command palette (Ctrl+Shift+P).',
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

  private async handleMessage(message: Record<string, unknown>): Promise<void> {
    switch (message.type) {
      case 'runCommand': {
        const cmd = message.command as string;
        vscode.commands.executeCommand(cmd);
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

        this.postMessage({
          type: 'userMessageEcho',
          text,
          id: Date.now().toString(),
        });

        await this.agentLoop.run(text, (event: LLMEvent) => {
          switch (event.type) {
            case 'text':
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
              this.postMessage({
                type: 'error',
                message: event.message,
                retryable: true,
              });
              break;
            case 'done':
              this.postMessage({ type: 'done', turnId: Date.now().toString() });
              break;
          }
        });
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
