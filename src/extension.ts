import * as vscode from 'vscode';
import * as path from 'path';
import { ChatViewProvider } from './chat/panel';
import { AgentLoop } from './agent/loop';
import { getConfig, PROVIDER_PRESETS } from './config';
import { providerForModel, allModels } from './config-types';
import type { Provider } from './config-types';
import { getApiKey, setApiKey } from './api-keys';
import { ToolRegistry } from './tools/registry';
import { readTool } from './tools/read';
import { writeTool } from './tools/write';
import { editTool } from './tools/edit';
import { bashTool, setBashCwd } from './tools/bash';
import { webFetchTool, setWebConsent } from './tools/web-fetch';
import { webSearchTool } from './tools/web-search';
import { WebConsent, ConsentDecision } from './tools/web-consent';
import { context7Tool } from './tools/context7';
import { todoWriteTool } from './tools/todo';
import { loadSkills } from './skills/loader';
import { piAgentDir, resetHarnessCache, setBundledHarnessDir, setWorkspaceRoot } from './agent/system-prompt';
import * as fs from 'fs';
import { createAnthropicProvider } from './providers/anthropic';
import { createOpenAICompatProvider } from './providers/openai-compat';
import { LLMProvider } from './providers/types';

let toolRegistry: ToolRegistry;
let skillsPath: string;
let chatProvider: ChatViewProvider;
let currentAgentLoop: AgentLoop | undefined;
let webConsent: WebConsent | undefined;

/** Cloud metadata is blocked in web-guard regardless; these are user policy. */
function readWebPolicy(): { allowed: string[]; blocked: string[] } {
  const cfg = vscode.workspace.getConfiguration('mypi-by-sl');
  return {
    allowed: cfg.get<string[]>('webAllowedDomains', []),
    blocked: cfg.get<string[]>('webBlockedDomains', []),
  };
}

/** Modal so the agent cannot slip a fetch past an unattended user. */
async function askWebConsent(host: string, url: string): Promise<ConsentDecision> {
  const short = url.length > 90 ? url.slice(0, 87) + '...' : url;
  const choice = await vscode.window.showWarningMessage(
    `MYPI wants to fetch from ${host}`,
    {
      modal: true,
      detail: `${short}\n\nContent from the web is untrusted and could try to make the agent leak data. Only allow domains you trust.`,
    },
    'Allow once',
    `Allow ${host} this session`,
  );
  if (choice === 'Allow once') return 'once';
  if (choice) return 'domain';
  return 'deny';
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Set working directory from workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      setBashCwd(workspaceFolder.uri.fsPath);
    }
    // Environment snapshot + workspace CLAUDE.md/AGENTS.md for the system prompt.
    setWorkspaceRoot(workspaceFolder?.uri.fsPath);

    toolRegistry = new ToolRegistry();
    toolRegistry.register(readTool);
    toolRegistry.register(writeTool);
    toolRegistry.register(editTool);
    toolRegistry.register(bashTool);
    toolRegistry.register(webFetchTool);
    toolRegistry.register(webSearchTool);
    toolRegistry.register(context7Tool);
    toolRegistry.register(todoWriteTool);

    // web_fetch is model-driven outbound HTTP: gate it on user consent.
    webConsent = new WebConsent(readWebPolicy(), askWebConsent);
    setWebConsent(webConsent);

    const config = getConfig();
    setBundledHarnessDir(path.join(context.extensionPath, 'harness'));

    // Context7 key: setting first (shippable), else env / ~/.pi/agent/context7-key.txt.
    const c7Key = vscode.workspace.getConfiguration('mypi-by-sl').get<string>('context7ApiKey', '');
    if (c7Key.trim()) {
      process.env.CONTEXT7_API_KEY = c7Key.trim();
    }
    const braveKey = vscode.workspace.getConfiguration('mypi-by-sl').get<string>('braveSearchApiKey', '');
    if (braveKey.trim()) {
      process.env.BRAVE_SEARCH_API_KEY = braveKey.trim();
    }

    // Parity with local PI: prefer the live skill library in ~/.pi/agent/skills,
    // fall back to the bundled snapshot.
    const piSkills = path.join(piAgentDir(), 'skills');
    skillsPath = config.skillsPath || (fs.existsSync(piSkills) ? piSkills : path.join(context.extensionPath, 'skills'));

    chatProvider = new ChatViewProvider(context.extensionUri);
    chatProvider.setState(context.globalState);
    chatProvider.onRequestAgentLoop = () => ensureAgentLoop(context);
    chatProvider.onSwitchModel = async (newModel: string) => {
      const loop = await createAgentLoop(context, newModel);
      if (loop) {
        // Must reassign: leaving this stale made every later effort change a
        // no-op against a discarded loop. setAgentLoop re-applies the effort.
        currentAgentLoop = loop;
        chatProvider.setAgentLoop(loop);
        // Persist so a reload comes back on the same model, and keep the
        // provider setting consistent with where the model actually routes.
        const settings = vscode.workspace.getConfiguration('mypi-by-sl');
        await settings.update('model', newModel, vscode.ConfigurationTarget.Global);
        const routed = providerForModel(newModel);
        if (routed) {
          await settings.update('provider', routed, vscode.ConfigurationTarget.Global);
        }
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
      vscode.commands.registerCommand('mypi-by-sl.selfTest', () =>
        selfTest(context),
      ),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('mypi-by-sl.webAllowedDomains') || e.affectsConfiguration('mypi-by-sl.webBlockedDomains')) {
          webConsent?.updatePolicy(readWebPolicy());
        }
        if (e.affectsConfiguration('mypi-by-sl.braveSearchApiKey')) {
          const k = vscode.workspace.getConfiguration('mypi-by-sl').get<string>('braveSearchApiKey', '');
          if (k.trim()) process.env.BRAVE_SEARCH_API_KEY = k.trim();
        }
      }),
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

async function promptSetApiKey(context: vscode.ExtensionContext, providerKey?: Provider): Promise<void> {
  const config = getConfig();
  let target = providerKey;
  if (!target) {
    const picked = await vscode.window.showQuickPick(
      (Object.entries(PROVIDER_PRESETS) as Array<[Provider, (typeof PROVIDER_PRESETS)[Provider]]>).map(([key, p]) => ({
        label: p.name,
        description: key === config.provider ? 'current default' : undefined,
        key,
      })),
      { placeHolder: 'Which provider is this API key for?' },
    );
    if (!picked) return;
    target = picked.key;
  }
  const preset = PROVIDER_PRESETS[target];
  const label = `${preset.name} API Key`;

  const key = await vscode.window.showInputBox({
    prompt: `Enter your ${label}`,
    password: true,
    placeHolder: 'sk-...',
  });

  if (key) {
    await setApiKey(context.secrets, target, key);
    vscode.window.showInformationMessage(`${label} saved successfully.`);
    currentAgentLoop = undefined;
    await ensureAgentLoop(context);
  }
}

async function createAgentLoop(context: vscode.ExtensionContext, modelOverride?: string): Promise<AgentLoop | undefined> {
  const config = getConfig();

  // The model decides the provider — picking "glm-4.6" routes to z.ai, picking
  // "claude-sonnet-5" routes to Anthropic. The provider setting is only the
  // fallback for models not in the catalog.
  const requestedModel = modelOverride || config.model;
  const providerKey: Provider = (requestedModel && providerForModel(requestedModel)) || config.provider;
  const preset = PROVIDER_PRESETS[providerKey];
  const model = requestedModel || preset.defaultModel;

  // Each provider has its own key slot; the pre-feature single key belonged to
  // the provider configured in settings.
  const apiKey = await getApiKey(context.secrets, providerKey, config.provider);
  if (!apiKey) {
    const result = await vscode.window.showErrorMessage(
      `No API key configured for ${preset.name}. Set one to use ${model}.`,
      'Set API Key',
    );
    if (result === 'Set API Key') {
      await promptSetApiKey(context, providerKey);
      return createAgentLoop(context, modelOverride);
    }
    return undefined;
  }

  let provider: LLMProvider;
  // A custom endpoint override only applies to the provider it was set for.
  const endpoint = (providerKey === config.provider && config.apiEndpoint) || preset.defaultEndpoint;

  if (providerKey === 'anthropic') {
    provider = createAnthropicProvider({ apiKey, model, thinkingLevel: config.thinkingLevel });
  } else {
    provider = createOpenAICompatProvider({
      apiKey,
      model,
      baseUrl: endpoint,
      providerKey,
      thinkingLevel: config.thinkingLevel,
    });
  }

  resetHarnessCache(); // pick up edits to ~/.pi/agent/SYSTEM.md / AGENTS.md
  const skills = await loadSkills(skillsPath);

  // The picker lists every model from every provider; switching routes automatically.
  return new AgentLoop(provider, toolRegistry, skills, config.maxTokens, model, preset.name, providerKey, allModels());
}

export function deactivate(): void {
  // Cleanup if needed
}

async function selfTest(context: vscode.ExtensionContext): Promise<void> {
  const apiKey = await getApiKey(context.secrets, 'z-ai', getConfig().provider);
  if (!apiKey) {
    vscode.window.showErrorMessage('Self-test: No Z.AI API key configured (the self-test targets glm-4.6).');
    return;
  }

  vscode.window.showInformationMessage('Self-test: Testing provider connection...');

  try {
    const provider = createOpenAICompatProvider({
      apiKey,
      model: 'glm-4.6',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      providerKey: 'z-ai',
      thinkingLevel: 'low',
      timeoutMs: 30000,
    });

    let text = '', thinking = '', error = '';
    const start = Date.now();

    for await (const event of provider.streamChat(
      [{ role: 'user', content: 'Say "OK"' }],
      [],
      'Reply with just OK.',
      256,
    )) {
      if (event.type === 'text') text += event.text;
      else if (event.type === 'thinking') thinking += event.text;
      else if (event.type === 'error') error = event.message;
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (error) {
      vscode.window.showErrorMessage(`Self-test FAILED (${elapsed}s): ${error}`);
    } else {
      vscode.window.showInformationMessage(`Self-test OK (${elapsed}s): "${text.trim()}" (thinking: ${thinking.length} chars)`);
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Self-test error: ${err.message}`);
  }
}
