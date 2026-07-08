import * as vscode from 'vscode';
import { AgentLoop } from '../agent/loop';

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private agentLoop: AgentLoop;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    agentLoop: AgentLoop,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.agentLoop = agentLoop;

    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables,
    );
  }

  static createOrShow(extensionUri: vscode.Uri, agentLoop: AgentLoop): ChatPanel {
    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
      ChatPanel.currentPanel.agentLoop = agentLoop;
      return ChatPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'sls-pi.chat',
      "SL's PI",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview')],
      },
    );

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, agentLoop);
    return ChatPanel.currentPanel;
  }

  static sendToWebview(message: Record<string, unknown>): void {
    ChatPanel.currentPanel?.panel.webview.postMessage(message);
  }

  async handleMessage(message: Record<string, unknown>): Promise<void> {
    switch (message.type) {
      case 'userMessage': {
        const text = message.text as string;
        ChatPanel.sendToWebview({
          type: 'userMessageEcho',
          text,
          id: Date.now().toString(),
        });

        await this.agentLoop.run(text, (event) => {
          switch (event.type) {
            case 'text':
              ChatPanel.sendToWebview({ type: 'assistantStreamChunk', text: event.text });
              break;
            case 'tool_use':
              ChatPanel.sendToWebview({
                type: 'toolCallStart',
                id: event.id,
                name: event.name,
                params: event.input,
              });
              break;
            case 'error':
              ChatPanel.sendToWebview({
                type: 'error',
                message: event.message,
                retryable: true,
              });
              break;
            case 'done':
              ChatPanel.sendToWebview({ type: 'done', turnId: Date.now().toString() });
              break;
          }
        });
        break;
      }
    }
  }

  prefillPrompt(text: string): void {
    ChatPanel.sendToWebview({ type: 'prefillPrompt', text });
  }

  private getHtml(): string {
    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview'),
    );

    const cspSource = this.panel.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src ${cspSource} 'unsafe-inline'; font-src https://cdn.jsdelivr.net; img-src data: ${cspSource};">
  <title>SL's PI</title>
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

  dispose(): void {
    ChatPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
