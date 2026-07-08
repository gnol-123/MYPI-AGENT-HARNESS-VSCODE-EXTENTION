# SL's PI VS Code Extension - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension that provides a full AI coding agent (SL's PI) in a sidebar chat panel, replicating the Claude Code agent loop with file read/write/edit/bash tools, multi-provider LLM support, and bundled skills.

**Architecture:** Two-process model via VS Code webview message-passing. The Extension Host (Node.js/TypeScript) runs the agent loop, tool executor, and LLM provider clients. The Chat Webview (React, bundled with esbuild) renders the chat UI. Communication uses typed `postMessage` contracts.

**Tech Stack:** TypeScript, VS Code Extension API, React 18, esbuild, @anthropic-ai/sdk, Node.js child_process

## Global Constraints

- Minimum VS Code version: 1.85
- Extension ID: `sls-pi`
- Command prefix: `sls-pi`
- Settings prefix: `sls-pi`
- All tool parameter names must match the existing agent's tool definitions
- API keys stored in VS Code SecretStorage, never in settings
- No external runtime dependencies beyond what's bundled in the .vsix
- TDD: write failing test first, then implementation

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.vscodeignore`
- Create: `esbuild.js`
- Create: `webview/package.json`
- Create: `webview/tsconfig.json`
- Create: `webview/index.html`
- Create: `webview/src/index.tsx`
- Create: `webview/src/types.ts`

**Interfaces:**
- Produces: `activate(context)` entry point in `src/extension.ts` (empty for now), webview build script, type definitions for webview message protocol

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "sls-pi",
  "displayName": "SL's PI",
  "description": "Full AI coding agent inside VS Code",
  "version": "0.1.0",
  "publisher": "sl",
  "engines": {
    "vscode": "^1.85.0"
  },
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "sls-pi.openChat",
        "title": "SL's PI: Open Chat"
      },
      {
        "command": "sls-pi.setApiKey",
        "title": "SL's PI: Set API Key"
      },
      {
        "command": "sls-pi.explainFile",
        "title": "SL's PI: Explain this file"
      },
      {
        "command": "sls-pi.explainSelection",
        "title": "SL's PI: Explain selection"
      },
      {
        "command": "sls-pi.fixSelection",
        "title": "SL's PI: Fix selection"
      },
      {
        "command": "sls-pi.refactorSelection",
        "title": "SL's PI: Refactor selection"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "sls-pi-sidebar",
          "title": "SL's PI",
          "icon": "$(comment-discussion)"
        }
      ]
    },
    "views": {
      "sls-pi-sidebar": [
        {
          "type": "webview",
          "id": "sls-pi.chatView",
          "name": "Chat"
        }
      ]
    },
    "menus": {
      "explorer/context": [
        {
          "command": "sls-pi.explainFile",
          "group": "sls-pi",
          "when": "resource"
        }
      ],
      "editor/context": [
        {
          "command": "sls-pi.explainSelection",
          "group": "sls-pi",
          "when": "editorHasSelection"
        },
        {
          "command": "sls-pi.fixSelection",
          "group": "sls-pi",
          "when": "editorHasSelection"
        },
        {
          "command": "sls-pi.refactorSelection",
          "group": "sls-pi",
          "when": "editorHasSelection"
        }
      ]
    },
    "configuration": {
      "title": "SL's PI",
      "properties": {
        "sls-pi.provider": {
          "type": "string",
          "default": "anthropic",
          "enum": ["anthropic", "openai-compatible"],
          "description": "LLM provider"
        },
        "sls-pi.model": {
          "type": "string",
          "default": "claude-sonnet-4-20250514",
          "description": "Model ID to use"
        },
        "sls-pi.apiEndpoint": {
          "type": "string",
          "default": "",
          "description": "Base URL for openai-compatible provider"
        },
        "sls-pi.maxTokens": {
          "type": "number",
          "default": 8192,
          "description": "Maximum tokens per response"
        },
        "sls-pi.toolTimeout": {
          "type": "number",
          "default": 120,
          "description": "Maximum seconds for bash commands"
        },
        "sls-pi.skillsPath": {
          "type": "string",
          "default": "",
          "description": "Override skill directory (empty = use bundled)"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile && npm run build-webview",
    "compile": "tsc -p ./tsconfig.json",
    "watch": "tsc -watch -p ./tsconfig.json",
    "build-webview": "node esbuild.js",
    "lint": "eslint src --ext ts"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "esbuild": "^0.19.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out", "webview"]
}
```

- [ ] **Step 3: Create .vscodeignore**

```
.vscode/**
.git/**
node_modules/**
src/**
tsconfig.json
webview/src/**
webview/tsconfig.json
webview/node_modules/**
esbuild.js
```

- [ ] **Step 4: Create esbuild.js for webview bundling**

```javascript
const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: [path.join(__dirname, 'webview', 'src', 'index.tsx')],
  bundle: true,
  outfile: path.join(__dirname, 'webview', 'out', 'bundle.js'),
  platform: 'browser',
  format: 'iife',
  external: [],
  sourcemap: true,
  minify: false,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
}).catch(() => process.exit(1));
```

- [ ] **Step 5: Create webview/package.json**

```json
{
  "name": "sls-pi-webview",
  "private": true,
  "scripts": {
    "build": "node ../esbuild.js"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 6: Create webview/tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "esnext",
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "outDir": "out",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "moduleResolution": "node",
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 7: Create webview/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'unsafe-inline' vscode-resource:; font-src https://cdn.jsdelivr.net; img-src data: vscode-resource:;">
  <title>SL's PI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); height: 100vh; overflow: hidden; }
    #root { height: 100%; display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="out/bundle.js"></script>
</body>
</html>
```

- [ ] **Step 8: Create webview/src/types.ts - message protocol types**

```typescript
export interface UserMessage {
  type: 'userMessage';
  text: string;
  attachments?: string[];
}

export interface AssistantStreamChunk {
  type: 'assistantStreamChunk';
  text: string;
}

export interface ToolCallStart {
  type: 'toolCallStart';
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface ToolCallResult {
  type: 'toolCallResult';
  id: string;
  result: string;
  truncated?: boolean;
}

export interface AgentError {
  type: 'error';
  message: string;
  retryable: boolean;
}

export interface AgentDone {
  type: 'done';
  turnId: string;
}

export type HostToWebview = AssistantStreamChunk | ToolCallStart | ToolCallResult | AgentError | AgentDone;
export type WebviewToHost = UserMessage | { type: 'cancelRequest' };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallEntry[];
  timestamp: number;
}

export interface ToolCallEntry {
  id: string;
  name: string;
  params: Record<string, unknown>;
  result?: string;
  truncated?: boolean;
}
```

- [ ] **Step 9: Create webview/src/index.tsx - minimal mount point**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 10: Install dependencies and verify build**

```bash
cd C:/Users/SL/Desktop/TestPI/sls-pi && npm install
```

Expected: npm installs all packages without errors. Then:

```bash
cd C:/Users/SL/Desktop/TestPI/sls-pi/webview && npm install
```

Expected: webview packages install without errors.

Then:

```bash
cd C:/Users/SL/Desktop/TestPI/sls-pi && npm run compile
```

Expected: TypeScript compiles without errors (extension.ts must exist but can be empty).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold SL's PI VS Code extension project"
```

---

### Task 2: Configuration System

**Files:**
- Create: `src/config.ts`

**Interfaces:**
- Produces: `getConfig()` returning `SLSConfig`, `getApiKey(secrets)`, `setApiKey(secrets, key)`, `SLSConfig` interface

- [ ] **Step 1: Write failing tests for config**

Create `src/__tests__/config.test.ts` (note: VS Code extension testing requires the vscode API to be available; for this task we test the pure functions and mock the VS Code API):

```typescript
import { describe, it, expect, vi } from 'vitest';

// We test the pure transformation functions, not the VS Code API calls themselves
describe('config', () => {
  it('should construct config from settings', () => {
    // This is a pure function test - the actual VS Code API call is tested in integration
    const settings = {
      'sls-pi.provider': 'anthropic',
      'sls-pi.model': 'claude-sonnet-4-20250514',
      'sls-pi.apiEndpoint': '',
      'sls-pi.maxTokens': 8192,
      'sls-pi.toolTimeout': 120,
      'sls-pi.skillsPath': '',
    };
    
    const config = buildConfig(settings);
    
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-sonnet-4-20250514');
    expect(config.maxTokens).toBe(8192);
    expect(config.toolTimeout).toBe(120);
  });

  it('should use defaults for missing settings', () => {
    const config = buildConfig({});
    expect(config.provider).toBe('anthropic');
    expect(config.maxTokens).toBe(8192);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run
```

Expected: FAIL - `buildConfig` is not defined.

- [ ] **Step 3: Create src/config.ts with minimal implementation**

```typescript
import * as vscode from 'vscode';

export interface SLSConfig {
  provider: 'anthropic' | 'openai-compatible';
  model: string;
  apiEndpoint: string;
  maxTokens: number;
  toolTimeout: number;
  skillsPath: string;
}

const DEFAULT_CONFIG: SLSConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiEndpoint: '',
  maxTokens: 8192,
  toolTimeout: 120,
  skillsPath: '',
};

function getVsCodeSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration('sls-pi');
  return {
    'sls-pi.provider': config.get<string>('provider', 'anthropic'),
    'sls-pi.model': config.get<string>('model', 'claude-sonnet-4-20250514'),
    'sls-pi.apiEndpoint': config.get<string>('apiEndpoint', ''),
    'sls-pi.maxTokens': config.get<number>('maxTokens', 8192),
    'sls-pi.toolTimeout': config.get<number>('toolTimeout', 120),
    'sls-pi.skillsPath': config.get<string>('skillsPath', ''),
  };
}

export function buildConfig(raw: Record<string, unknown>): SLSConfig {
  return {
    provider: (raw['sls-pi.provider'] as SLSConfig['provider']) ?? DEFAULT_CONFIG.provider,
    model: (raw['sls-pi.model'] as string) ?? DEFAULT_CONFIG.model,
    apiEndpoint: (raw['sls-pi.apiEndpoint'] as string) ?? DEFAULT_CONFIG.apiEndpoint,
    maxTokens: (raw['sls-pi.maxTokens'] as number) ?? DEFAULT_CONFIG.maxTokens,
    toolTimeout: (raw['sls-pi.toolTimeout'] as number) ?? DEFAULT_CONFIG.toolTimeout,
    skillsPath: (raw['sls-pi.skillsPath'] as string) ?? DEFAULT_CONFIG.skillsPath,
  };
}

export function getConfig(): SLSConfig {
  return buildConfig(getVsCodeSettings());
}

export async function getApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get('sls-pi.apiKey');
}

export async function setApiKey(secrets: vscode.SecretStorage, key: string): Promise<void> {
  await secrets.store('sls-pi.apiKey', key);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/__tests__/config.test.ts
git commit -m "feat: add configuration system with VS Code settings and SecretStorage"
```

---

### Task 3: Read File Tool

**Files:**
- Create: `src/tools/types.ts`
- Create: `src/tools/read.ts`

**Interfaces:**
- Consumes: None
- Produces: `ToolResult` type, `readTool` implementing `{ name: 'read', parameters: { path, offset?, limit? } }` returning `Promise<ToolResult>`

- [ ] **Step 1: Create src/tools/types.ts**

```typescript
export interface ToolResult {
  content: string;
  truncated?: boolean;
  error?: string;
}

export interface ToolHandler {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}
```

- [ ] **Step 2: Write failing test for read tool**

Create `src/__tests__/tools/read.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { readTool } from '../../tools/read';

vi.mock('vscode', () => ({
  workspace: {
    fs: {
      readFile: vi.fn(),
    },
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    joinPath: (...args: unknown[]) => ({ fsPath: (args[0] as { fsPath: string }).fsPath + '/' + args[1] }),
  },
}));

describe('read tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "read"', () => {
    expect(readTool.name).toBe('read');
  });

  it('should read a file and return content', async () => {
    const mockContent = new TextEncoder().encode('hello world');
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(mockContent);

    const result = await readTool.execute({ path: 'test.txt' });

    expect(result.content).toBe('hello world');
    expect(result.truncated).toBeUndefined();
  });

  it('should return error for missing file', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await readTool.execute({ path: 'nonexistent.txt' });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('ENOENT');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run
```

Expected: FAIL - module `../../tools/read` not found.

- [ ] **Step 4: Create src/tools/read.ts**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { ToolHandler, ToolResult } from './types';

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024; // 50KB

function resolvePath(filePath: string): vscode.Uri {
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('No workspace folder open');
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, filePath);
}

async function readFileContent(uri: vscode.Uri, offset?: number, limit?: number): Promise<ToolResult> {
  const raw = await vscode.workspace.fs.readFile(uri);
  const text = new TextDecoder().decode(raw);

  let content = text;
  let truncated = false;

  const lines = content.split('\n');
  const startLine = offset ? offset - 1 : 0; // Convert 1-indexed offset to 0-indexed
  const maxLines = limit ?? MAX_LINES;

  if (startLine > 0 || lines.length > maxLines) {
    content = lines.slice(startLine, startLine + maxLines).join('\n');
    if (lines.length > startLine + maxLines) {
      truncated = true;
    }
  }

  if (content.length > MAX_BYTES) {
    content = content.substring(0, MAX_BYTES);
    truncated = true;
  }

  return { content, truncated: truncated || undefined };
}

const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

function isImageFile(uri: vscode.Uri): boolean {
  const ext = path.extname(uri.fsPath).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
}

export const readTool: ToolHandler = {
  name: 'read',
  description: 'Read the contents of a file. Supports text files and images (jpg, png, gif, webp, bmp). Images are returned as base64. Output is truncated to 2000 lines or 50KB.',
  parameters: {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', description: 'Path to the file to read (relative or absolute)' },
      offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
      limit: { type: 'number', description: 'Maximum number of lines to read' },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const filePath = params.path as string;
      if (!filePath) {
        return { content: '', error: 'Missing required parameter: path' };
      }

      const uri = resolvePath(filePath);

      if (isImageFile(uri)) {
        const raw = await vscode.workspace.fs.readFile(uri);
        const base64 = Buffer.from(raw).toString('base64');
        const mimeType = `image/${path.extname(uri.fsPath).slice(1)}`;
        return { content: `data:${mimeType};base64,${base64}` };
      }

      return await readFileContent(uri, params.offset as number | undefined, params.limit as number | undefined);
    } catch (err) {
      return { content: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/types.ts src/tools/read.ts src/__tests__/tools/read.test.ts
git commit -m "feat: add read file tool"
```

---

### Task 4: Write File Tool

**Files:**
- Create: `src/tools/write.ts`
- Create: `src/__tests__/tools/write.test.ts`

**Interfaces:**
- Consumes: `ToolHandler`, `ToolResult` from `src/tools/types.ts`
- Produces: `writeTool` implementing `{ name: 'write', parameters: { path, content } }`

- [ ] **Step 1: Write failing test for write tool**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { writeTool } from '../../tools/write';

vi.mock('vscode', () => ({
  workspace: {
    fs: {
      writeFile: vi.fn(),
      createDirectory: vi.fn(),
    },
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    joinPath: (...args: unknown[]) => ({ fsPath: (args[0] as { fsPath: string }).fsPath + '/' + args[1] }),
  },
  window: {
    showTextDocument: vi.fn(),
  },
}));

describe('write tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "write"', () => {
    expect(writeTool.name).toBe('write');
  });

  it('should write content to a file', async () => {
    const result = await writeTool.execute({ path: 'newfile.ts', content: 'const x = 1;' });

    expect(result.content).toContain('Successfully wrote');
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });

  it('should return error for write failure', async () => {
    vi.mocked(vscode.workspace.fs.writeFile).mockRejectedValue(new Error('EACCES'));

    const result = await writeTool.execute({ path: 'readonly.ts', content: 'x' });

    expect(result.error).toContain('EACCES');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run
```

Expected: FAIL.

- [ ] **Step 3: Create src/tools/write.ts**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { ToolHandler, ToolResult } from './types';

export const writeTool: ToolHandler = {
  name: 'write',
  description: 'Write content to a file. Creates the file and parent directories if they do not exist.',
  parameters: {
    type: 'object',
    required: ['path', 'content'],
    properties: {
      path: { type: 'string', description: 'Path to the file to write (relative or absolute)' },
      content: { type: 'string', description: 'Content to write to the file' },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const filePath = params.path as string;
      const content = params.content as string;

      if (!filePath) return { content: '', error: 'Missing required parameter: path' };
      if (content === undefined || content === null) return { content: '', error: 'Missing required parameter: content' };

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return { content: '', error: 'No workspace folder open' };
      }

      const uri = path.isAbsolute(filePath)
        ? vscode.Uri.file(filePath)
        : vscode.Uri.joinPath(workspaceFolder.uri, filePath);

      // Create parent directories
      const dirUri = vscode.Uri.file(path.dirname(uri.fsPath));
      await vscode.workspace.fs.createDirectory(dirUri);

      // Write file
      const data = new TextEncoder().encode(content);
      await vscode.workspace.fs.writeFile(uri, data);

      // Open in editor
      await vscode.window.showTextDocument(uri, { preview: false });

      return { content: `Successfully wrote ${Buffer.byteLength(content)} bytes to ${filePath}` };
    } catch (err) {
      return { content: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/write.ts src/__tests__/tools/write.test.ts
git commit -m "feat: add write file tool"
```

---

### Task 5: Edit File Tool

**Files:**
- Create: `src/tools/edit.ts`
- Create: `src/__tests__/tools/edit.test.ts`

**Interfaces:**
- Consumes: `ToolHandler`, `ToolResult` from `src/tools/types.ts`
- Produces: `editTool` implementing `{ name: 'edit', parameters: { path, edits: Array<{ oldText, newText }> } }`

- [ ] **Step 1: Write failing test for edit tool**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { editTool } from '../../tools/edit';

const mockDocument = {
  getText: vi.fn(),
  uri: { fsPath: '/workspace/test.ts', scheme: 'file' },
  lineCount: 10,
};

vi.mock('vscode', () => ({
  workspace: {
    fs: {
      readFile: vi.fn(),
    },
    openTextDocument: vi.fn(),
    applyEdit: vi.fn(),
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, scheme: 'file' }),
    joinPath: (...args: unknown[]) => ({ fsPath: (args[0] as { fsPath: string }).fsPath + '/' + args[1] }),
  },
  WorkspaceEdit: vi.fn().mockImplementation(() => ({
    replace: vi.fn(),
  })),
  Range: vi.fn(),
  Position: vi.fn(),
  window: {},
}));

describe('edit tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "edit"', () => {
    expect(editTool.name).toBe('edit');
  });

  it('should replace exact text in a file', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any);
    mockDocument.getText.mockReturnValue('function hello() {\n  console.log("hello");\n}');
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true);

    const result = await editTool.execute({
      path: 'test.ts',
      edits: [{ oldText: 'console.log("hello")', newText: 'console.log("hi")' }],
    });

    expect(result.content).toContain('Successfully applied');
    expect(vscode.workspace.applyEdit).toHaveBeenCalled();
  });

  it('should return error when oldText is not found', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument as any);
    mockDocument.getText.mockReturnValue('function hello() {}');

    const result = await editTool.execute({
      path: 'test.ts',
      edits: [{ oldText: 'nonexistent', newText: 'x' }],
    });

    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run
```

Expected: FAIL.

- [ ] **Step 3: Create src/tools/edit.ts**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { ToolHandler, ToolResult } from './types';

interface Edit {
  oldText: string;
  newText: string;
}

export const editTool: ToolHandler = {
  name: 'edit',
  description: 'Edit a single file using exact text replacement. Each edits[].oldText must match a unique, non-overlapping region of the original file.',
  parameters: {
    type: 'object',
    required: ['path', 'edits'],
    properties: {
      path: { type: 'string', description: 'Path to the file to edit (relative or absolute)' },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          required: ['oldText', 'newText'],
          properties: {
            oldText: { type: 'string', description: 'Exact text to replace' },
            newText: { type: 'string', description: 'Replacement text' },
          },
        },
        description: 'One or more targeted replacements',
      },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const filePath = params.path as string;
      const edits = params.edits as Edit[];

      if (!filePath) return { content: '', error: 'Missing required parameter: path' };
      if (!edits || !Array.isArray(edits) || edits.length === 0) {
        return { content: '', error: 'Missing required parameter: edits' };
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return { content: '', error: 'No workspace folder open' };
      }

      const uri = path.isAbsolute(filePath)
        ? vscode.Uri.file(filePath)
        : vscode.Uri.joinPath(workspaceFolder.uri, filePath);

      const document = await vscode.workspace.openTextDocument(uri);
      const fullText = document.getText();

      const workspaceEdit = new vscode.WorkspaceEdit();

      for (const edit of edits) {
        const startIndex = fullText.indexOf(edit.oldText);
        if (startIndex === -1) {
          return { content: '', error: `Could not find text to replace:\n${edit.oldText.substring(0, 200)}` };
        }

        // Check uniqueness
        const secondOccurrence = fullText.indexOf(edit.oldText, startIndex + 1);
        if (secondOccurrence !== -1) {
          return { content: '', error: `oldText is not unique in the file; it appears multiple times:\n${edit.oldText.substring(0, 200)}` };
        }

        const startPos = document.positionAt(startIndex);
        const endPos = document.positionAt(startIndex + edit.oldText.length);
        const range = new vscode.Range(startPos, endPos);

        workspaceEdit.replace(uri, range, edit.newText);
      }

      const applied = await vscode.workspace.applyEdit(workspaceEdit);
      if (!applied) {
        return { content: '', error: 'Failed to apply edits' };
      }

      return { content: `Successfully applied ${edits.length} edit(s) to ${filePath}` };
    } catch (err) {
      return { content: '', error: err instanceof Error ? err.message : String(err) };
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/edit.ts src/__tests__/tools/edit.test.ts
git commit -m "feat: add edit file tool"
```

---

### Task 6: Bash Tool + Tool Registry

**Files:**
- Create: `src/tools/bash.ts`
- Create: `src/tools/registry.ts`
- Create: `src/__tests__/tools/bash.test.ts`
- Create: `src/__tests__/tools/registry.test.ts`

**Interfaces:**
- Consumes: `ToolHandler`, `ToolResult` from `src/tools/types.ts`, `readTool`, `writeTool`, `editTool`, `SLSConfig` from `src/config.ts`
- Produces: `bashTool`, `ToolRegistry` class with `register()`, `getTool()`, `getAllToolDefs()`, `execute(name, params)`

- [ ] **Step 1: Write failing test for bash tool**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec } from 'child_process';
import { bashTool } from '../../tools/bash';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

describe('bash tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have name "bash"', () => {
    expect(bashTool.name).toBe('bash');
  });

  it('should execute a command and return stdout', async () => {
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb: any) => {
      cb(null, 'hello stdout', '');
    });

    const result = await bashTool.execute({ command: 'echo hello' });
    expect(result.content).toContain('hello stdout');
  });

  it('should return stderr on non-zero exit', async () => {
    vi.mocked(exec).mockImplementation((_cmd, _opts, cb: any) => {
      const err: any = new Error('command failed');
      err.code = 1;
      err.killed = false;
      cb(err, '', 'error output');
    });

    const result = await bashTool.execute({ command: 'false' });
    expect(result.error).toBeDefined();
    expect(result.content).toContain('error output');
  });
});
```

- [ ] **Step 2: Write failing test for registry**

```typescript
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../tools/registry';
import { ToolHandler } from '../../tools/types';

describe('ToolRegistry', () => {
  it('should register and retrieve a tool', () => {
    const registry = new ToolRegistry();
    const mockTool: ToolHandler = {
      name: 'test',
      description: 'A test tool',
      parameters: {},
      execute: async () => ({ content: 'ok' }),
    };

    registry.register(mockTool);
    expect(registry.getTool('test')).toBe(mockTool);
  });

  it('should return tool definitions for LLM', () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'read',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      execute: async () => ({ content: '' }),
    });

    const defs = registry.getAllToolDefs();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('read');
    expect(defs[0].input_schema).toBeDefined();
  });

  it('should execute a tool by name', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'echo',
      description: 'Echo',
      parameters: {},
      execute: async (params) => ({ content: `echo: ${params.text}` }),
    });

    const result = await registry.execute('echo', { text: 'hello' });
    expect(result.content).toBe('echo: hello');
  });

  it('should throw for unknown tool', async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute('unknown', {})).rejects.toThrow('Tool not found');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run
```

Expected: FAIL.

- [ ] **Step 4: Create src/tools/bash.ts**

```typescript
import { exec, ExecException } from 'child_process';
import { ToolHandler, ToolResult } from './types';

const DEFAULT_TIMEOUT = 120_000; // 120 seconds
const MAX_OUTPUT = 50 * 1024; // 50KB
const MAX_LINES = 2000;

function truncateOutput(text: string): { content: string; truncated: boolean } {
  const lines = text.split('\n');
  let truncated = false;

  if (lines.length > MAX_LINES) {
    text = lines.slice(0, MAX_LINES).join('\n');
    truncated = true;
  }

  if (text.length > MAX_OUTPUT) {
    text = text.substring(0, MAX_OUTPUT);
    truncated = true;
  }

  return { content: text, truncated };
}

export const bashTool: ToolHandler = {
  name: 'bash',
  description: 'Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to 2000 lines or 50KB.',
  parameters: {
    type: 'object',
    required: ['command'],
    properties: {
      command: { type: 'string', description: 'Bash command to execute' },
      timeout: { type: 'number', description: 'Timeout in seconds (optional, default 120)' },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const command = params.command as string;
    const timeoutMs = ((params.timeout as number) ?? 120) * 1000;

    if (!command) {
      return { content: '', error: 'Missing required parameter: command' };
    }

    return new Promise((resolve) => {
      exec(command, {
        timeout: timeoutMs || DEFAULT_TIMEOUT,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        cwd: undefined, // Uses process.cwd() = workspace root
      }, (error: ExecException | null, stdout: string, stderr: string) => {
        const combined = [stdout, stderr].filter(Boolean).join('\n');
        const { content, truncated } = truncateOutput(combined || '(no output)');

        if (error) {
          resolve({
            content,
            truncated: truncated || undefined,
            error: `Exit code ${error.code ?? 'unknown'}: ${error.message}`,
          });
        } else {
          resolve({ content, truncated: truncated || undefined });
        }
      });
    });
  },
};
```

- [ ] **Step 5: Create src/tools/registry.ts**

```typescript
import { ToolHandler, ToolResult } from './types';

export class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map();

  register(tool: ToolHandler): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  getAllToolDefs(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  async execute(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.execute(params);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/bash.ts src/tools/registry.ts src/__tests__/tools/bash.test.ts src/__tests__/tools/registry.test.ts
git commit -m "feat: add bash tool and tool registry"
```

---

### Task 7: LLM Provider Types + Anthropic Provider

**Files:**
- Create: `src/providers/types.ts`
- Create: `src/providers/anthropic.ts`
- Create: `src/__tests__/providers/anthropic.test.ts`

**Interfaces:**
- Consumes: `SLSConfig` from `src/config.ts`, tool definitions from registry
- Produces: `LLMProvider` interface, `createAnthropicProvider(config, apiKey)` factory

- [ ] **Step 1: Create src/providers/types.ts**

```typescript
export interface Message {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
}

export interface MessageContent {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type LLMEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface LLMProvider {
  streamChat(
    messages: Message[],
    tools: ToolDef[],
    systemPrompt: string,
    maxTokens: number,
  ): AsyncGenerator<LLMEvent>;
}
```

- [ ] **Step 2: Write failing test for Anthropic provider**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnthropicProvider } from '../../providers/anthropic';

// Mock @anthropic-ai/sdk
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      stream: vi.fn(),
    },
  })),
}));

describe('Anthropic provider', () => {
  it('should create a provider with config', () => {
    const provider = createAnthropicProvider({ apiKey: 'test-key', model: 'claude-sonnet-4-20250514' });
    expect(provider).toBeDefined();
    expect(provider.streamChat).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run
```

Expected: FAIL - module not found.

- [ ] **Step 4: Create src/providers/anthropic.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMEvent, Message, ToolDef } from './types';

interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    async *streamChat(
      messages: Message[],
      tools: ToolDef[],
      systemPrompt: string,
      maxTokens: number,
    ): AsyncGenerator<LLMEvent> {
      try {
        const stream = client.messages.stream({
          model: config.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: typeof m.content === 'string' ? m.content : m.content.map((c) => {
              if (c.type === 'tool_use') {
                return {
                  type: 'tool_use' as const,
                  id: c.id!,
                  name: c.name!,
                  input: c.input!,
                };
              }
              if (c.type === 'tool_result') {
                return {
                  type: 'tool_result' as const,
                  tool_use_id: c.tool_use_id!,
                  content: c.content ?? '',
                  is_error: c.is_error,
                };
              }
              return { type: 'text' as const, text: c.text ?? '' };
            }),
          })),
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            // Start accumulating tool use
          } else if (event.type === 'content_block_stop') {
            // Tool use complete
          } else if (event.type === 'message_stop') {
            // Message complete
          }
        }

        // Get final message for tool calls
        const finalMessage = await stream.finalMessage();
        for (const block of finalMessage.content) {
          if (block.type === 'tool_use') {
            yield { type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> };
          }
        }

        yield { type: 'done' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield { type: 'error', message };
      }
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/providers/types.ts src/providers/anthropic.ts src/__tests__/providers/anthropic.test.ts
git commit -m "feat: add LLM provider types and Anthropic provider"
```

---

### Task 8: OpenAI-Compatible Provider

**Files:**
- Create: `src/providers/openai-compat.ts`
- Create: `src/__tests__/providers/openai-compat.test.ts`

**Interfaces:**
- Consumes: `LLMProvider`, `Message`, `ToolDef`, `LLMEvent` from `src/providers/types.ts`
- Produces: `createOpenAICompatProvider(config)` factory

- [ ] **Step 1: Write failing test for OpenAI-compatible provider**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createOpenAICompatProvider } from '../../providers/openai-compat';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenAI-compatible provider', () => {
  it('should create a provider with config', () => {
    const provider = createOpenAICompatProvider({
      apiKey: 'test-key',
      model: 'gpt-4',
      baseUrl: 'https://api.openai.com/v1',
    });
    expect(provider).toBeDefined();
    expect(provider.streamChat).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run
```

Expected: FAIL.

- [ ] **Step 3: Create src/providers/openai-compat.ts**

```typescript
import { LLMProvider, LLMEvent, Message, ToolDef } from './types';

interface OpenAICompatConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

function convertMessages(messages: Message[]): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content });
    } else {
      const toolCalls: Array<Record<string, unknown>> = [];
      const textParts: string[] = [];

      for (const part of msg.content) {
        if (part.type === 'text') {
          textParts.push(part.text ?? '');
        } else if (part.type === 'tool_use') {
          toolCalls.push({
            id: part.id,
            type: 'function',
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input),
            },
          });
        } else if (part.type === 'tool_result') {
          result.push({
            role: 'tool',
            tool_call_id: part.tool_use_id,
            content: part.content ?? '',
          });
        }
      }

      if (toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: textParts.join('\n') || null,
          tool_calls: toolCalls,
        });
      } else if (textParts.length > 0) {
        result.push({ role: msg.role, content: textParts.join('\n') });
      }
    }
  }

  return result;
}

function convertTools(tools: ToolDef[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

export function createOpenAICompatProvider(config: OpenAICompatConfig): LLMProvider {
  return {
    async *streamChat(
      messages: Message[],
      tools: ToolDef[],
      systemPrompt: string,
      maxTokens: number,
    ): AsyncGenerator<LLMEvent> {
      try {
        const body: Record<string, unknown> = {
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...convertMessages(messages),
          ],
          max_tokens: maxTokens,
          stream: true,
        };

        if (tools.length > 0) {
          body.tools = convertTools(tools);
        }

        const baseUrl = config.baseUrl.replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          yield { type: 'error', message: `HTTP ${response.status}: ${errorText}` };
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          yield { type: 'error', message: 'No response body' };
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // Accumulators for tool calls
        const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta;

              if (delta?.content) {
                yield { type: 'text', text: delta.content };
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index;
                  if (!toolCalls.has(idx)) {
                    toolCalls.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' });
                  }
                  const existing = toolCalls.get(idx)!;
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name = tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                }
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // Yield accumulated tool calls
        for (const [, tc] of toolCalls) {
          try {
            const input = JSON.parse(tc.arguments);
            yield { type: 'tool_use', id: tc.id, name: tc.name, input };
          } catch {
            yield { type: 'tool_use', id: tc.id, name: tc.name, input: {} };
          }
        }

        yield { type: 'done' };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield { type: 'error', message };
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai-compat.ts src/__tests__/providers/openai-compat.test.ts
git commit -m "feat: add OpenAI-compatible LLM provider"
```

---

### Task 9: Skills Loader

**Files:**
- Create: `src/skills/loader.ts`
- Create: `src/__tests__/skills/loader.test.ts`

**Interfaces:**
- Consumes: None
- Produces: `Skill` type, `loadSkills(skillsDir)` function returning `Skill[]`, `matchSkills(skills, userMessage)` function

- [ ] **Step 1: Write failing test for skill loader**

```typescript
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSkills, matchSkills, Skill } from '../../skills/loader';

vi.mock('fs/promises');

describe('skills loader', () => {
  it('should load a skill from a SKILL.md file', async () => {
    const skillMd = `---
name: test-skill
description: A test skill for testing
---

# Test Skill

These are the instructions.`;

    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'test-skill', isDirectory: () => true },
    ] as any);
    vi.mocked(fs.readFile).mockResolvedValue(skillMd);

    const skills = await loadSkills('/fake/skills');
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test-skill');
    expect(skills[0].description).toBe('A test skill for testing');
    expect(skills[0].instructions).toContain('These are the instructions');
  });

  it('should match skills based on description keywords', () => {
    const skills: Skill[] = [
      { name: 'brainstorming', description: 'Use before any creative work', instructions: '...' },
      { name: 'debugging', description: 'Use when encountering any bug', instructions: '...' },
    ];

    const matched = matchSkills(skills, 'I want to build a new feature');
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe('brainstorming');
  });

  it('should return empty array for no match', () => {
    const skills: Skill[] = [
      { name: 'debugging', description: 'Use when encountering any bug', instructions: '...' },
    ];

    const matched = matchSkills(skills, 'Can you explain this to me?');
    expect(matched).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run

# Vitest is already configured from earlier tasks
```

Expected: FAIL.

- [ ] **Step 3: Create src/skills/loader.ts**

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

export interface Skill {
  name: string;
  description: string;
  instructions: string;
  location: string;
}

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];

  const data: Record<string, string> = {};
  for (const line of frontmatterText.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      data[key] = value;
    }
  }

  return { data, body };
}

export async function loadSkills(skillsDir: string): Promise<Skill[]> {
  const skills: Skill[] = [];

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(skillsDir, entry.name);
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      try {
        const content = await fs.readFile(skillMdPath, 'utf-8');
        const { data, body } = parseFrontmatter(content);

        skills.push({
          name: data.name ?? entry.name,
          description: data.description ?? '',
          instructions: body.trim(),
          location: skillPath,
        });
      } catch {
        // Skip directories without valid SKILL.md
      }
    }
  } catch {
    // Skills dir doesn't exist or can't be read
  }

  return skills;
}

export function matchSkills(skills: Skill[], userMessage: string): Skill[] {
  const messageLower = userMessage.toLowerCase();
  const matched: Skill[] = [];

  for (const skill of skills) {
    const keywords = skill.description.toLowerCase().split(/\s+/);
    const matchCount = keywords.filter((kw) => kw.length > 3 && messageLower.includes(kw)).length;

    if (matchCount >= 2) {
      matched.push(skill);
    }
  }

  return matched;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/skills/loader.ts src/__tests__/skills/loader.test.ts
git commit -m "feat: add skills loader with frontmatter parsing and matching"
```

---

### Task 10: Conversation History + System Prompt

**Files:**
- Create: `src/agent/history.ts`
- Create: `src/agent/system-prompt.ts`
- Create: `src/__tests__/agent/history.test.ts`
- Create: `src/__tests__/agent/system-prompt.test.ts`

**Interfaces:**
- Consumes: `Skill` from `src/skills/loader.ts`, `Message` from `src/providers/types.ts`
- Produces: `ConversationHistory` class, `buildSystemPrompt(skills, userConfig?)` function

- [ ] **Step 1: Write failing test for history**

```typescript
import { describe, it, expect } from 'vitest';
import { ConversationHistory } from '../../agent/history';

describe('ConversationHistory', () => {
  it('should add and retrieve messages', () => {
    const history = new ConversationHistory();
    history.addUserMessage('hello');
    history.addAssistantMessage('hi there');

    const messages = history.getMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('should add tool results', () => {
    const history = new ConversationHistory();
    history.addAssistantMessage('', [
      { id: 'tool_1', name: 'read', input: { path: 'test.ts' } },
    ]);
    history.addToolResult('tool_1', 'file content here');

    const messages = history.getMessages();
    expect(messages).toHaveLength(1);
    const content = messages[0].content;
    expect(Array.isArray(content)).toBe(true);

    const parts = content as Array<Record<string, unknown>>;
    const toolResultPart = parts.find((p) => p.type === 'tool_result');
    expect(toolResultPart).toBeDefined();
    expect((toolResultPart as any).content).toBe('file content here');
  });

  it('should clear history', () => {
    const history = new ConversationHistory();
    history.addUserMessage('hello');
    history.clear();
    expect(history.getMessages()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write failing test for system prompt**

```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../agent/system-prompt';
import { Skill } from '../../skills/loader';

describe('buildSystemPrompt', () => {
  it('should include base prompt and skills', () => {
    const skills: Skill[] = [
      { name: 'test', description: 'test skill', instructions: 'Do the thing.', location: '/fake' },
    ];

    const prompt = buildSystemPrompt(skills, 'test task');
    expect(prompt).toContain('test skill');
    expect(prompt).toContain('Do the thing.');
  });

  it('should work with empty skills', () => {
    const prompt = buildSystemPrompt([], 'test task');
    expect(prompt.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run
```

Expected: Both FAIL.

- [ ] **Step 4: Create src/agent/history.ts**

```typescript
import { Message, MessageContent } from '../providers/types';

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export class ConversationHistory {
  private messages: Message[] = [];
  private pendingToolCalls: ToolCall[] = [];

  addUserMessage(text: string): void {
    this.messages.push({ role: 'user', content: text });
  }

  addAssistantMessage(text: string, toolCalls?: ToolCall[]): void {
    const content: MessageContent[] = [];

    if (text) {
      content.push({ type: 'text', text });
    }

    if (toolCalls) {
      this.pendingToolCalls = toolCalls;
      for (const tc of toolCalls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
    }

    this.messages.push({
      role: 'assistant',
      content: content.length === 1 && content[0].type === 'text' ? text : content,
    });
  }

  addToolResult(id: string, result: string, isError?: boolean): void {
    const lastMsg = this.messages[this.messages.length - 1];
    if (!lastMsg || typeof lastMsg.content === 'string') return;

    lastMsg.content.push({
      type: 'tool_result',
      tool_use_id: id,
      content: result,
      is_error: isError,
    });

    this.pendingToolCalls = this.pendingToolCalls.filter((tc) => tc.id !== id);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getPendingToolCalls(): ToolCall[] {
    return [...this.pendingToolCalls];
  }

  clear(): void {
    this.messages = [];
    this.pendingToolCalls = [];
  }
}
```

- [ ] **Step 5: Create src/agent/system-prompt.ts**

```typescript
import { Skill } from '../skills/loader';

const BASE_PROMPT = `You are SL's PI, a coding agent running inside VS Code. You help the user with software engineering tasks by reading files, running shell commands, editing code, and writing new files, all from within the editor.

Available tools: read, write, edit, bash. Use bash for file operations like ls, rg, and find. Prefer rg (ripgrep) over grep, and read files directly with read rather than cat.

# Tone and style
- Be concise, direct, and to the point.
- Minimize preamble and postamble. Do not open with "Great", "Certainly", or "Sure".
- Output is rendered in a terminal as Markdown. Reference files as clickable paths.
- Never fabricate results. If a test fails, say so and show the output.

# Verification before completion
Before you claim something is done, fixed, working, or passing, actually verify it: run the build, run the tests, run the linter, or drive the affected flow end-to-end. Evidence before assertions, always.

# Design work
When building or reshaping any UI or visual output, use a distinctive, intentional point of view rather than templated defaults.

# Safety
- Do what has been asked; nothing more, nothing less.
- For hard-to-reverse actions (deleting files, force operations), confirm first unless clearly authorized.
- Do not commit or push to git unless the user asks.
`;

export function buildSystemPrompt(skills: Skill[], task?: string): string {
  let prompt = BASE_PROMPT;

  // Add skill descriptions
  if (skills.length > 0) {
    prompt += '\n\nThe following skills provide specialized instructions:\n\n';
    for (const skill of skills) {
      prompt += `<skill name="${skill.name}">\n`;
      prompt += `${skill.instructions}\n`;
      prompt += `</skill>\n\n`;
    }
  }

  // Add current task context
  if (task) {
    prompt += `\nCurrent task: ${task}`;
  }

  return prompt;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add src/agent/history.ts src/agent/system-prompt.ts src/__tests__/agent/history.test.ts src/__tests__/agent/system-prompt.test.ts
git commit -m "feat: add conversation history manager and system prompt builder"
```

---

### Task 11: Agent Loop

**Files:**
- Create: `src/agent/loop.ts`
- Create: `src/__tests__/agent/loop.test.ts`

**Interfaces:**
- Consumes: `LLMProvider`, `Message`, `ToolDef`, `LLMEvent` from `src/providers/types.ts`, `ToolRegistry` from `src/tools/registry.ts`, `ConversationHistory` from `src/agent/history.ts`, `Skill` from `src/skills/loader.ts`, `buildSystemPrompt` from `src/agent/system-prompt.ts`, `SLSConfig` from `src/config.ts`
- Produces: `AgentLoop` class with `run(userMessage, callbacks)` method

- [ ] **Step 1: Write failing test for agent loop**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from '../../agent/loop';
import { ToolRegistry } from '../../tools/registry';
import { ConversationHistory } from '../../agent/history';
import { LLMProvider, LLMEvent, ToolDef, Message } from '../../providers/types';
import { Skill } from '../../skills/loader';

function createMockProvider(responses: LLMEvent[][]): LLMProvider {
  let callIndex = 0;
  return {
    async *streamChat(
      _msgs: Message[],
      _tools: ToolDef[],
      _system: string,
      _maxTokens: number,
    ): AsyncGenerator<LLMEvent> {
      if (callIndex >= responses.length) {
        yield { type: 'done' };
        return;
      }
      for (const event of responses[callIndex]) {
        yield event;
      }
      callIndex++;
    },
  };
}

describe('AgentLoop', () => {
  it('should handle a simple text response', async () => {
    const provider = createMockProvider([
      [{ type: 'text', text: 'Hello!' }, { type: 'done' }],
    ]);
    const registry = new ToolRegistry();
    const skills: Skill[] = [];

    const loop = new AgentLoop(provider, registry, skills, 8192);
    const events: LLMEvent[] = [];
    await loop.run('Hi', (event) => events.push(event));

    expect(events.some((e) => e.type === 'text')).toBe(true);
  });

  it('should handle tool calls and loop back', async () => {
    const provider = createMockProvider([
      [
        { type: 'tool_use', id: 't1', name: 'read', input: { path: 'test.ts' } },
        { type: 'done' },
      ],
      [
        { type: 'text', text: 'I read the file.' },
        { type: 'done' },
      ],
    ]);

    const registry = new ToolRegistry();
    registry.register({
      name: 'read',
      description: 'Read a file',
      parameters: {},
      execute: async (params) => ({ content: `content of ${params.path}` }),
    });

    const skills: Skill[] = [];
    const loop = new AgentLoop(provider, registry, skills, 8192);
    const events: LLMEvent[] = [];
    await loop.run('Read test.ts', (event) => events.push(event));

    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(1);
    expect(textEvents[0].text).toBe('I read the file.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run
```

Expected: FAIL.

- [ ] **Step 3: Create src/agent/loop.ts**

```typescript
import { LLMProvider, LLMEvent, ToolDef } from '../providers/types';
import { ToolRegistry } from '../tools/registry';
import { ConversationHistory } from './history';
import { Skill } from '../skills/loader';
import { buildSystemPrompt } from './system-prompt';

const MAX_TOOL_ITERATIONS = 25;

export class AgentLoop {
  constructor(
    private provider: LLMProvider,
    private toolRegistry: ToolRegistry,
    private skills: Skill[],
    private maxTokens: number,
  ) {}

  async run(
    userMessage: string,
    onEvent: (event: LLMEvent) => void,
  ): Promise<void> {
    const history = new ConversationHistory();
    history.addUserMessage(userMessage);

    const systemPrompt = buildSystemPrompt(this.skills, userMessage);
    const toolDefs = this.toolRegistry.getAllToolDefs();
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      // Single LLM call per iteration: collect text + tool calls from one stream
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let currentText = '';

      const stream = this.provider.streamChat(
        history.getMessages(),
        toolDefs,
        systemPrompt,
        this.maxTokens,
      );

      for await (const event of stream) {
        if (event.type === 'text') {
          currentText += event.text;
          onEvent(event);
        } else if (event.type === 'tool_use') {
          toolCalls.push({ id: event.id, name: event.name, input: event.input });
        } else if (event.type === 'error') {
          onEvent(event);
          return;
        }
      }

      // Record assistant message with text and any tool calls
      history.addAssistantMessage(
        currentText,
        toolCalls.length > 0 ? toolCalls : undefined,
      );

      if (toolCalls.length === 0) {
        return; // Pure text response, done
      }

      // Execute tools and feed results back
      for (const tc of toolCalls) {
        onEvent({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });

        try {
          const result = await this.toolRegistry.execute(tc.name, tc.input);
          const resultText = result.error
            ? `Error: ${result.error}`
            : result.content;

          history.addToolResult(
            tc.id,
            resultText + (result.truncated ? '\n[Output truncated]' : ''),
            !!result.error,
          );
        } catch (err) {
          history.addToolResult(
            tc.id,
            `Error: ${err instanceof Error ? err.message : String(err)}`,
            true,
          );
        }
      }
      // Continue loop to let LLM process tool results
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/loop.ts src/__tests__/agent/loop.test.ts
git commit -m "feat: add agent loop with tool execution and streaming"
```

---

### Task 12: Chat Panel Manager (Webview Host Side)

**Files:**
- Create: `src/chat/panel.ts`

**Interfaces:**
- Consumes: `AgentLoop` from `src/agent/loop.ts`, message types from `webview/src/types.ts`
- Produces: `ChatPanel` class managing webview lifecycle and message routing

- [ ] **Step 1: Create src/chat/panel.ts**

```typescript
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
      case 'cancelRequest':
        // Cancel current agent run (future enhancement)
        break;
    }
  }

  prefillPrompt(text: string): void {
    ChatPanel.sendToWebview({ type: 'prefillPrompt', text });
  }

  private getHtml(): string {
    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview'),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src ${this.panel.webview.cspSource} 'unsafe-inline'; font-src https://cdn.jsdelivr.net; img-src data: ${this.panel.webview.cspSource};">
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
```

- [ ] **Step 2: Compile to verify no TypeScript errors**

```bash
npm run compile
```

Expected: Compiles without errors (extension.ts must exist but can be a placeholder with `export function activate() {}`).

- [ ] **Step 3: Commit**

```bash
git add src/chat/panel.ts
git commit -m "feat: add chat panel webview host manager"
```

---

### Task 13: Webview React UI

**Files:**
- Create: `webview/src/App.tsx`
- Create: `webview/src/ChatView.tsx`
- Create: `webview/src/InputBox.tsx`
- Create: `webview/src/ToolCard.tsx`

**Interfaces:**
- Consumes: Types from `webview/src/types.ts`, VS Code webview API (`acquireVsCodeApi`)
- Produces: Full chat UI with message list, input box, tool cards

- [ ] **Step 1: Create webview/src/App.tsx**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { ChatView } from './ChatView';
import { InputBox } from './InputBox';
import { Message, HostToWebview } from './types';

const vscodeApi = acquireVsCodeApi();

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
  },
  header: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: 'var(--vscode-sideBarTitle-foreground)',
  },
  main: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
};

export const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState<Map<string, { name: string; params: Record<string, unknown> }>>(new Map());

  const sendMessage = useCallback((text: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreamingText('');
    setIsLoading(true);
    setCurrentToolCalls(new Map());

    vscodeApi.postMessage({ type: 'userMessage', text });
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'assistantStreamChunk':
          setStreamingText((prev) => prev + msg.text);
          break;

        case 'toolCallStart':
          setCurrentToolCalls((prev) => {
            const next = new Map(prev);
            next.set(msg.id, { name: msg.name, params: msg.params });
            return next;
          });
          break;

        case 'done': {
          const finalText = streamingText;
          const toolCalls = Array.from(currentToolCalls.entries()).map(([id, tc]) => ({
            id,
            name: tc.name,
            params: tc.params,
          }));

          setMessages((prev) => [
            ...prev,
            {
              id: msg.turnId,
              role: 'assistant',
              content: finalText,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              timestamp: Date.now(),
            },
          ]);
          setStreamingText('');
          setCurrentToolCalls(new Map());
          setIsLoading(false);
          break;
        }

        case 'error':
          setStreamingText((prev) => prev + `\n\n❌ ${msg.message}`);
          setIsLoading(false);
          break;

        case 'userMessageEcho':
          // Already handled in sendMessage
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [streamingText, currentToolCalls]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>🔷 SL's PI</div>
      <div style={styles.main}>
        <ChatView
          messages={messages}
          streamingText={streamingText}
          isLoading={isLoading}
        />
        <InputBox onSend={sendMessage} disabled={isLoading} />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create webview/src/ChatView.tsx**

```tsx
import React, { useRef, useEffect } from 'react';
import { Message } from './types';
import { ToolCard } from './ToolCard';

interface ChatViewProps {
  messages: Message[];
  streamingText: string;
  isLoading: boolean;
}

const styles = {
  container: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px',
  },
  message: {
    marginBottom: '12px',
    padding: '6px 8px',
    borderRadius: '4px',
    maxWidth: '100%',
  },
  userMessage: {
    background: 'var(--vscode-textBlockQuote-background)',
  },
  assistantMessage: {
    background: 'transparent',
  },
  role: {
    fontSize: '11px',
    fontWeight: 600,
    marginBottom: '2px',
    color: 'var(--vscode-descriptionForeground)',
    textTransform: 'uppercase' as const,
  },
  content: {
    fontSize: '13px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  streaming: {
    padding: '6px 8px',
    fontSize: '13px',
    lineHeight: '1.5',
    color: 'var(--vscode-foreground)',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '13px',
    textAlign: 'center' as const,
    padding: '20px',
  },
  loadingDot: {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--vscode-descriptionForeground)',
    marginLeft: '2px',
    animation: 'pulse 1s infinite',
  },
};

export const ChatView: React.FC<ChatViewProps> = ({ messages, streamingText, isLoading }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div style={styles.container}>
      {messages.length === 0 && !streamingText && (
        <div style={styles.emptyState}>
          Ask me anything about your codebase.<br />
          I can read, write, edit, and run commands.
        </div>
      )}

      {messages.map((msg) => (
        <div key={msg.id}>
          <div
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
            }}
          >
            <div style={styles.role}>{msg.role}</div>
            <div style={styles.content}>{msg.content}</div>
          </div>
          {msg.toolCalls?.map((tc) => (
            <ToolCard key={tc.id} id={tc.id} name={tc.name} params={tc.params} result={tc.result} />
          ))}
        </div>
      ))}

      {streamingText && (
        <div style={styles.streaming}>
          <div style={styles.role}>ASSISTANT</div>
          {streamingText}
          {isLoading && <span style={styles.loadingDot} />}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
```

- [ ] **Step 3: Create webview/src/InputBox.tsx**

```tsx
import React, { useState, useRef, KeyboardEvent } from 'react';

interface InputBoxProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

const styles = {
  container: {
    display: 'flex',
    padding: '8px',
    borderTop: '1px solid var(--vscode-sideBarSectionHeader-border)',
    gap: '6px',
  },
  input: {
    flex: 1,
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '13px',
    fontFamily: 'var(--vscode-font-family)',
    resize: 'none' as const,
    outline: 'none',
    maxHeight: '120px',
    minHeight: '32px',
  },
  sendButton: {
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 14px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  sendButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  charCount: {
    textAlign: 'right' as const,
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground)',
    marginTop: '2px',
  },
};

export const InputBox: React.FC<InputBoxProps> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  return (
    <div>
      <div style={styles.container}>
        <textarea
          ref={textareaRef}
          style={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask anything..."
          disabled={disabled}
          rows={1}
        />
        <button
          style={{
            ...styles.sendButton,
            ...(disabled ? styles.sendButtonDisabled : {}),
          }}
          onClick={handleSend}
          disabled={disabled}
        >
          ▶
        </button>
      </div>
      <div style={styles.charCount}>{text.length} chars · Enter to send, Shift+Enter for newline</div>
    </div>
  );
};
```

- [ ] **Step 4: Create webview/src/ToolCard.tsx**

```tsx
import React, { useState } from 'react';

interface ToolCardProps {
  id: string;
  name: string;
  params: Record<string, unknown>;
  result?: string;
  truncated?: boolean;
}

const COLORS: Record<string, string> = {
  read: '#4a9eff',
  write: '#4ec94e',
  edit: '#e0c040',
  bash: '#888888',
};

const styles = {
  container: {
    margin: '4px 0 4px 16px',
    borderLeft: '3px solid var(--vscode-textBlockQuote-border)',
    paddingLeft: '8px',
    fontSize: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    padding: '3px 0',
    userSelect: 'none' as const,
  },
  name: {
    fontWeight: 600,
    fontSize: '11px',
  },
  params: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '200px',
  },
  result: {
    marginTop: '2px',
    padding: '4px 6px',
    background: 'var(--vscode-textCodeBlock-background)',
    borderRadius: '3px',
    fontSize: '11px',
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    maxHeight: '200px',
    overflowY: 'auto' as const,
  },
  arrow: {
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground)',
    transition: 'transform 0.15s',
  },
};

export const ToolCard: React.FC<ToolCardProps> = ({ name, params, result }) => {
  const [expanded, setExpanded] = useState(false);
  const color = COLORS[name] ?? '#888';

  const paramsStr = Object.entries(params)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40)}`)
    .join(', ');

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={() => setExpanded(!expanded)}>
        <span style={styles.arrow}>{expanded ? '▼' : '▶'}</span>
        <span style={{ ...styles.name, color }}>{name}</span>
        <span style={styles.params}>{paramsStr}</span>
      </div>
      {expanded && result !== undefined && (
        <div style={styles.result}>{result || '(no output)'}</div>
      )}
    </div>
  );
};
```

- [ ] **Step 5: Build webview and verify**

```bash
npm run build-webview
```

Expected: esbuild builds successfully, `webview/out/bundle.js` is created.

- [ ] **Step 6: Commit**

```bash
git add webview/src/App.tsx webview/src/ChatView.tsx webview/src/InputBox.tsx webview/src/ToolCard.tsx
git commit -m "feat: add React chat UI for webview"
```

---

### Task 14: Extension Entry Point + Context Menu Integration

**Files:**
- Create: `src/extension.ts`

**Interfaces:**
- Consumes: `ChatPanel` from `src/chat/panel.ts`, `AgentLoop` from `src/agent/loop.ts`, `getConfig`, `getApiKey`, `setApiKey` from `src/config.ts`, `ToolRegistry` from `src/tools/registry.ts`, `readTool`, `writeTool`, `editTool`, `bashTool` from `src/tools/*`, `loadSkills` from `src/skills/loader.ts`, `createAnthropicProvider` from `src/providers/anthropic.ts`, `createOpenAICompatProvider` from `src/providers/openai-compat.ts`
- Produces: `activate(context)` and `deactivate()` entry points

- [ ] **Step 1: Create src/extension.ts**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { ChatPanel } from './chat/panel';
import { AgentLoop } from './agent/loop';
import { getConfig, getApiKey, setApiKey } from './config';
import { ToolRegistry } from './tools/registry';
import { readTool } from './tools/read';
import { writeTool } from './tools/write';
import { editTool } from './tools/edit';
import { bashTool } from './tools/bash';
import { loadSkills } from './skills/loader';
import { createAnthropicProvider } from './providers/anthropic';
import { createOpenAICompatProvider } from './providers/openai-compat';
import { LLMProvider } from './providers/types';

let toolRegistry: ToolRegistry;
let skillsPath: string;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize tool registry
  toolRegistry = new ToolRegistry();
  toolRegistry.register(readTool);
  toolRegistry.register(writeTool);
  toolRegistry.register(editTool);
  toolRegistry.register(bashTool);

  // Determine skills path
  const config = getConfig();
  skillsPath = config.skillsPath || path.join(context.extensionPath, 'skills');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sls-pi.openChat', () => openChat(context)),
    vscode.commands.registerCommand('sls-pi.setApiKey', () => promptSetApiKey(context)),
    vscode.commands.registerCommand('sls-pi.explainFile', (uri?: vscode.Uri) =>
      contextAction(context, 'explainFile', uri),
    ),
    vscode.commands.registerCommand('sls-pi.explainSelection', () =>
      contextAction(context, 'explainSelection'),
    ),
    vscode.commands.registerCommand('sls-pi.fixSelection', () =>
      contextAction(context, 'fixSelection'),
    ),
    vscode.commands.registerCommand('sls-pi.refactorSelection', () =>
      contextAction(context, 'refactorSelection'),
    ),
  );

  // Register webview view provider for sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('sls-pi.chatView', {
      resolveWebviewView(webviewView) {
        // For sidebar webview views, we create the panel manually
        // The sidebar view approach requires a different panel type
        // We'll use the standard webview panel approach for now
      },
    }),
  );
}

async function openChat(context: vscode.ExtensionContext): Promise<void> {
  const agentLoop = await createAgentLoop(context);
  if (!agentLoop) return;

  ChatPanel.createOrShow(context.extensionUri, agentLoop);
}

async function contextAction(
  context: vscode.ExtensionContext,
  action: 'explainFile' | 'explainSelection' | 'fixSelection' | 'refactorSelection',
  fileUri?: vscode.Uri,
): Promise<void> {
  const agentLoop = await createAgentLoop(context);
  if (!agentLoop) return;

  const panel = ChatPanel.createOrShow(context.extensionUri, agentLoop);

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
    panel.prefillPrompt(prompt);
  }
}

async function promptSetApiKey(context: vscode.ExtensionContext): Promise<void> {
  const provider = getConfig().provider;
  const label = provider === 'anthropic' ? 'Anthropic API Key' : 'OpenAI API Key';

  const key = await vscode.window.showInputBox({
    prompt: `Enter your ${label}`,
    password: true,
    placeHolder: 'sk-...',
  });

  if (key) {
    await setApiKey(context.secrets, key);
    vscode.window.showInformationMessage(`${label} saved successfully.`);
  }
}

async function createAgentLoop(context: vscode.ExtensionContext): Promise<AgentLoop | undefined> {
  const config = getConfig();

  // Check API key
  const apiKey = await getApiKey(context.secrets);
  if (!apiKey) {
    const result = await vscode.window.showErrorMessage(
      'No API key configured. Set one to use SL\'s PI.',
      'Set API Key',
    );
    if (result === 'Set API Key') {
      await promptSetApiKey(context);
      return createAgentLoop(context);
    }
    return undefined;
  }

  // Create provider
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

  // Load skills
  const skills = await loadSkills(skillsPath);

  return new AgentLoop(provider, toolRegistry, skills, config.maxTokens);
}

export function deactivate(): void {
  // Cleanup if needed
}
```

- [ ] **Step 2: Compile to verify no TypeScript errors**

```bash
npm run compile
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add extension entry point with commands and context menu integration"
```

---

### Task 15: Bundle Skills + Final Integration

**Files:**
- Modify: `esbuild.js` (add skills copy step)
- Create: Script to copy skills from `~/.pi/agent/skills`

**Interfaces:**
- No new interfaces; this task bundles the existing skill files and verifies end-to-end

- [ ] **Step 1: Add skills copy to build script**

Create `scripts/copy-skills.js`:

```javascript
const fs = require('fs');
const path = require('path');

const sourceDir = path.join(process.env.HOME || process.env.USERPROFILE, '.pi', 'agent', 'skills');
const targetDir = path.join(__dirname, '..', 'skills');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Skills source not found: ${src}`);
    return;
  }

  // Remove existing
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(sourceDir, targetDir);
console.log('Skills copied successfully.');
```

- [ ] **Step 2: Update package.json scripts**

Add to the scripts section:

```json
"copy-skills": "node scripts/copy-skills.js"
```

Update `vscode:prepublish`:

```json
"vscode:prepublish": "npm run copy-skills && npm run compile && npm run build-webview"
```

- [ ] **Step 3: Copy skills and do full build**

```bash
npm run copy-skills
npm run compile
npm run build-webview
```

Expected: All commands succeed. Skills directory is populated. TypeScript compiles. Webview bundle is created.

- [ ] **Step 4: Verify the skills were copied**

```bash
ls skills/
```

Expected: List of skill directories (brainstorming, systematic-debugging, etc.) with SKILL.md files.

- [ ] **Step 5: Commit**

```bash
git add scripts/copy-skills.js .vscodeignore
git commit -m "feat: add skills bundling script and finalize build pipeline"
```

---

### Task 16: End-to-End Testing in VS Code

**Files:**
- No new files; manual verification

**Steps:**

- [ ] **Step 1: Package the extension**

```bash
npx vsce package
```

Expected: Creates `sls-pi-0.1.0.vsix`.

- [ ] **Step 2: Install in VS Code**

```bash
code --install-extension sls-pi-0.1.0.vsix
```

- [ ] **Step 3: Set API key**

Run command `SL's PI: Set API Key`, enter a valid Anthropic API key.

- [ ] **Step 4: Open the chat panel**

- Click the SL's PI icon in the activity bar, OR
- Run `SL's PI: Open Chat` from command palette

Expected: Chat panel opens on the side.

- [ ] **Step 5: Send a test message**

Type "What files are in my workspace?" and send.

Expected: Agent responds, uses bash tool to run `ls`, shows results in a tool card, then responds with analysis.

- [ ] **Step 6: Test context menu**

- Right-click a file in the explorer → "SL's PI: Explain this file"
- Select code in editor → right-click → "SL's PI: Explain selection"

Expected: Chat opens with pre-filled prompt and agent responds.

- [ ] **Step 7: Test file editing**

Ask agent to "Create a file called hello.txt with the text 'Hello from SL\'s PI'"

Expected: Agent creates file, opens it in editor.

- [ ] **Step 8: Fix any issues found during testing**

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "chore: final polish after E2E testing"
```
