import * as vscode from 'vscode';
import * as path from 'path';
import { ChatViewProvider } from './chat/panel';
import { AgentLoop } from './agent/loop';
import { getConfig, getApiKey, setApiKey, PROVIDER_PRESETS } from './config';
import { ToolRegistry } from './tools/registry';
import { readTool } from './tools/read';
import { writeTool } from './tools/write';
import { editTool } from './tools/edit';
import { bashTool, setBashCwd } from './tools/bash';
import { webFetchTool } from './tools/web-fetch';
import { context7Tool } from './tools/context7';
import { loadSkills } from './skills/loader';
import { piAgentDir, resetHarnessCache, setBundledHarnessDir } from './agent/system-prompt';
import * as fs from 'fs';
import { createAnthropicProvider } from './providers/anthropic';
import { createOpenAICompatProvider } from './providers/openai-compat';
import { LLMProvider } from './providers/types';

let toolRegistry: ToolRegistry;
let skillsPath: string;
let chatProvider: ChatViewProvider;
let currentAgentLoop: AgentLoop | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Set working directory from workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      setBashCwd(workspaceFolder.uri.fsPath);
    }

    toolRegistry = new ToolRegistry();
    toolRegistry.register(readTool);
    toolRegistry.register(writeTool);
    toolRegistry.register(editTool);
    toolRegistry.register(bashTool);
    toolRegistry.register(webFetchTool);
    toolRegistry.register(context7Tool);

    const config = getConfig();
    setBundledHarnessDir(path.join(context.extensionPath, 'harness'));

    // Context7 key: setting first (shippable), else env / ~/.pi/agent/context7-key.txt.
    const c7Key = vscode.workspace.getConfiguration('mypi-by-sl').get<string>('context7ApiKey', '');
    if (c7Key.trim()) {
      process.env.CONTEXT7_API_KEY = c7Key.trim();
    }

    // Parity with local PI: prefer the live skill library in ~/.pi/agent/skills,
    // fall back to the bundled snapshot.
    const piSkills = path.join(piAgentDir(), 'skills');
    skillsPath = config.skillsPath || (fs.existsSync(piSkills) ? piSkills : path.join(context.extensionPath, 'skills'));

    chatProvider = new ChatViewProvider(context.extensionUri);
    chatProvider.setState(context.globalState);
    chatProvider.onRequestAgentLoop = () => ensureAgentLoop(context);
    chatProvider.onSwitchModel = async (newModel: string) => {
      currentAgentLoop = undefined;
      const loop = await createAgentLoop(context, newModel);
      if (loop) {
        chatProvider.setAgentLoop(loop);
      }
    };

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('mypi-by-sl.catChat', chatProvider),
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

    vscode.window.showInformationMessage('MYPI-by-SL activated! Click the cat icon or run "MYPI-by-SL: Open Chat".');
  } catch (err) {
    vscode.window.showErrorMessage(`MYPI-by-SL failed to activate: ${err}`);
    console.error('MYPI-by-SL activation error:', err);
  }
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
  await vscode.commands.executeCommand('mypi-by-sl.catChat.focus');
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
  const preset = PROVIDER_PRESETS[config.provider];
  const label = `${preset.name} API Key`;

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

async function createAgentLoop(context: vscode.ExtensionContext, modelOverride?: string): Promise<AgentLoop | undefined> {
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
  const preset = PROVIDER_PRESETS[config.provider];

  const model = modelOverride || config.model || preset.defaultModel;
  const endpoint = config.apiEndpoint || preset.defaultEndpoint;

  if (config.provider === 'anthropic') {
    provider = createAnthropicProvider({ apiKey, model, thinkingLevel: config.thinkingLevel });
  } else {
    provider = createOpenAICompatProvider({
      apiKey,
      model,
      baseUrl: endpoint,
      providerKey: config.provider,
      thinkingLevel: config.thinkingLevel,
    });
  }

  resetHarnessCache(); // pick up edits to ~/.pi/agent/SYSTEM.md / AGENTS.md
  const skills = await loadSkills(skillsPath);

  return new AgentLoop(provider, toolRegistry, skills, config.maxTokens, model, preset.name, config.provider, preset.models);
}

export function deactivate(): void {
  // Cleanup if needed
}
