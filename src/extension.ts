import * as vscode from 'vscode';
import * as path from 'path';
import { ChatViewProvider } from './chat/panel';
import { AgentLoop } from './agent/loop';
import { getConfig, getApiKey, setApiKey } from './config';
import { ToolRegistry } from './tools/registry';
import { readTool } from './tools/read';
import { writeTool } from './tools/write';
import { editTool } from './tools/edit';
import { bashTool } from './tools/bash';
import { webFetchTool } from './tools/web-fetch';
import { context7Tool } from './tools/context7';
import { loadSkills } from './skills/loader';
import { createAnthropicProvider } from './providers/anthropic';
import { createOpenAICompatProvider } from './providers/openai-compat';
import { LLMProvider } from './providers/types';

let toolRegistry: ToolRegistry;
let skillsPath: string;
let chatProvider: ChatViewProvider;
let currentAgentLoop: AgentLoop | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  toolRegistry = new ToolRegistry();
  toolRegistry.register(readTool);
  toolRegistry.register(writeTool);
  toolRegistry.register(editTool);
  toolRegistry.register(bashTool);
  toolRegistry.register(webFetchTool);
  toolRegistry.register(context7Tool);

  const config = getConfig();
  skillsPath = config.skillsPath || path.join(context.extensionPath, 'skills');

  chatProvider = new ChatViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('mypi-by-sl.chatView', chatProvider),
    vscode.commands.registerCommand('mypi-by-sl.openChat', () => openChat(context)),
    vscode.commands.registerCommand('mypi-by-sl.setApiKey', () => promptSetApiKey(context)),
    vscode.commands.registerCommand('mypi-by-sl.explainFile', (uri?: vscode.Uri) =>
      contextAction(context, 'explainFile', uri),
    ),
    vscode.commands.registerCommand('mypi-by-sl.explainSelection', () =>
      contextAction(context, 'explainSelection'),
    ),
    vscode.commands.registerCommand('mypi-by-sl.fixSelection', () =>
      contextAction(context, 'fixSelection'),
    ),
    vscode.commands.registerCommand('mypi-by-sl.refactorSelection', () =>
      contextAction(context, 'refactorSelection'),
    ),
  );
}

async function ensureAgentLoop(context: vscode.ExtensionContext): Promise<AgentLoop | undefined> {
  if (currentAgentLoop) return currentAgentLoop;
  currentAgentLoop = await createAgentLoop(context);
  if (currentAgentLoop) {
    chatProvider.setAgentLoop(currentAgentLoop);
  }
  return currentAgentLoop;
}

async function openChat(context: vscode.ExtensionContext): Promise<void> {
  await ensureAgentLoop(context);
}

async function contextAction(
  context: vscode.ExtensionContext,
  action: 'explainFile' | 'explainSelection' | 'fixSelection' | 'refactorSelection',
  fileUri?: vscode.Uri,
): Promise<void> {
  await ensureAgentLoop(context);

  let prompt = '';

  switch (action) {
    case 'explainFile': {
      const uri = fileUri ?? vscode.window.activeTextEditor?.document.uri;
      if (uri) {
        const relativePath = vscode.workspace.asRelativePath(uri);
        prompt = `Explain what this file does: ${relativePath}`;
      }
      break;
    }
    case 'explainSelection': {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selection = editor.document.getText(editor.selection);
        prompt = `Explain this code:\n\`\`\`\n${selection}\n\`\`\``;
      }
      break;
    }
    case 'fixSelection': {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selection = editor.document.getText(editor.selection);
        prompt = `Fix this code:\n\`\`\`\n${selection}\n\`\`\``;
      }
      break;
    }
    case 'refactorSelection': {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selection = editor.document.getText(editor.selection);
        prompt = `Refactor this code:\n\`\`\`\n${selection}\n\`\`\``;
      }
      break;
    }
  }

  if (prompt) {
    chatProvider.setPendingPrompt(prompt);
  }
}

async function promptSetApiKey(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();
  const label = config.provider === 'anthropic' ? 'Anthropic API Key' : 'OpenAI API Key';

  const key = await vscode.window.showInputBox({
    prompt: `Enter your ${label}`,
    password: true,
    placeHolder: 'sk-...',
  });

  if (key) {
    await setApiKey(context.secrets, key);
    vscode.window.showInformationMessage(`${label} saved successfully.`);
    currentAgentLoop = undefined;
    await ensureAgentLoop(context);
  }
}

async function createAgentLoop(context: vscode.ExtensionContext): Promise<AgentLoop | undefined> {
  const config = getConfig();

  const apiKey = await getApiKey(context.secrets);
  if (!apiKey) {
    const result = await vscode.window.showErrorMessage(
      "No API key configured. Set one to use MYPI-by-SL.",
      'Set API Key',
    );
    if (result === 'Set API Key') {
      await promptSetApiKey(context);
      return createAgentLoop(context);
    }
    return undefined;
  }

  let provider: LLMProvider;
  if (config.provider === 'openai-compatible') {
    provider = createOpenAICompatProvider({
      apiKey,
      model: config.model,
      baseUrl: config.apiEndpoint || 'https://api.openai.com/v1',
    });
  } else {
    provider = createAnthropicProvider({
      apiKey,
      model: config.model,
    });
  }

  const skills = await loadSkills(skillsPath);

  return new AgentLoop(provider, toolRegistry, skills, config.maxTokens);
}

export function deactivate(): void {
  // Cleanup if needed
}
