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
      case 'userMessage': {
        const text = message.text as string;
        if (!this.agentLoop) {
          this.postMessage({
            type: 'error',
            message: 'No API key configured. Run "SL\'s PI: Set API Key" from the command palette.',
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
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview'),
    );

    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src ${cspSource} 'unsafe-inline'; font-src https://cdn.jsdelivr.net; img-src data: ${cspSource};">
  <title>MYPI-by-SL</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); height: 100vh; overflow: hidden; }
    #root { height: 100%; display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${webviewUri}/out/bundle.js"></script>
</body>
</html>`;
  }
}
