# SL's PI - VS Code Extension Design Spec

**Date:** 2026-07-08
**Status:** Draft

## Overview

SL's PI is a VS Code extension that provides a full AI coding agent inside the editor, replicating the behavior, tools, skills, and system prompts of the Claude Code agent. Users interact via a sidebar chat panel, context menu actions, and command palette commands.

---

## Architecture

### Process Model

Two processes communicate via VS Code's webview message-passing:

- **Extension Host** (Node.js, TypeScript): Runs the agent loop, tool executor, skill loader, LLM provider clients, and secret storage access. This is where all logic lives.
- **Chat Webview** (React, bundled HTML/JS): Pure UI rendering -- message list, streaming text, tool call cards, input box. No direct access to filesystem or terminal.

```
┌──────────────────────────────────────────────────┐
│                  VS Code Window                    │
│                                                    │
│  ┌──────────────────┐    ┌────────────────────┐   │
│  │   Chat Webview   │◄──►│  Extension Host    │   │
│  │                  │    │                    │   │
│  │  - Chat UI       │    │  - Agent Loop      │   │
│  │  - Message list  │    │  - Tool Executor   │   │
│  │  - Input box     │    │  - Skill Loader    │   │
│  │  - Diff previews │    │  - LLM Providers   │   │
│  │                  │    │  - Secrets Store   │   │
│  └──────────────────┘    └────────────────────┘   │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │            VS Code APIs                       │ │
│  │  Workspace FS │ Terminal │ Commands │ Notifs  │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Message Contract

All communication between webview and host uses typed `postMessage`:

| Direction | Message Type | Payload |
|-----------|-------------|---------|
| Webview → Host | `userMessage` | `{ text, attachments? }` |
| Webview → Host | `cancelRequest` | `{}` |
| Host → Webview | `assistantStreamChunk` | `{ text: string }` |
| Host → Webview | `toolCallStart` | `{ id, name, params }` |
| Host → Webview | `toolCallResult` | `{ id, result, truncated? }` |
| Host → Webview | `error` | `{ message, retryable }` |
| Host → Webview | `done` | `{ turnId }` |

---

## Agent Loop

The agent loop replicates the Claude Code agent behavior:

1. User sends a message via the webview
2. Extension host builds the system prompt from bundled config + loaded skills
3. Full conversation history (including tool calls and results) is assembled
4. LLM is called with tool definitions
5. If the LLM responds with text: stream it to the webview, stop
6. If the LLM responds with tool calls: execute them via Tool Executor, feed results back into the conversation, go to step 4
7. On error: surface to the user in chat with a retry option

### System Prompt

The system prompt is bundled as extension assets. It includes:
- The core agent prompt (persona, tone, guidelines)
- Tool descriptions matching the implemented tool set
- Skill descriptions (when loaded/triggered by context)

### Skills System

Skills are bundled as extension assets in a `skills/` directory under the extension root. At startup the extension:
- Scans the skills directory
- Loads `using-superpowers` skill which gates all behavior
- Makes skills available for injection into the system prompt based on user task context

Skill structure follows the AGENTS.md format: `SKILL.md` files with name, description, and instructions.

---

## Tools

Tools are implemented against VS Code APIs. They mirror the following interfaces:

### `read`
- **VS Code API:** `vscode.workspace.fs.readFile` + `vscode.Uri`
- **Parameters:** `{ path: string, offset?: number, limit?: number }`
- **Returns:** File contents, truncated at 2000 lines / 50KB
- **Image support:** Images (jpg, png, gif, webp, bmp) returned as base64

### `write`
- **VS Code API:** `vscode.workspace.fs.writeFile` + creates parent directories
- **Parameters:** `{ path: string, content: string }`
- **Post-write:** Opens file in editor if not already open

### `edit`
- **VS Code API:** `vscode.WorkspaceEdit`
- **Parameters:** `{ path: string, edits: Array<{ oldText: string, newText: string }> }`
- **Validation:** Each `oldText` must match uniquely; no overlapping edits in one call

### `bash`
- **VS Code API:** `vscode.window.createTerminal` + shell execution
- **Parameters:** `{ command: string, timeout?: number }`
- **Default timeout:** 120 seconds
- **Output:** stdout + stderr, truncated to 2000 lines / 50KB
- **Working directory:** Workspace root

---

## Multi-Provider LLM Support

### Provider Interface

```typescript
interface LLMProvider {
  chat(messages: Message[], tools: ToolDef[], options: LLMOptions): AsyncIterable<LLMEvent>;
}

type LLMEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; params: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'done' };
```

### Supported Providers

- **Anthropic:** Uses the native Anthropic Messages API with streaming
- **OpenAI-compatible:** Uses OpenAI chat completions API format, configurable endpoint

### Configuration

Provider selection via VS Code settings (`sls-pi.provider`). Model, endpoint, and max tokens also configured in settings. API keys stored via `vscode.SecretStorage`.

---

## Chat Panel UI

### Layout

The chat panel lives in the VS Code sidebar (activity bar). Zones:

```
┌─────────────────────────────────┐
│  🔷 SL's PI                  ⚙️ │  Header bar
├─────────────────────────────────┤
│                                 │
│  [Assistant] message...         │
│  [User] message...              │  Message list
│  [Assistant] streaming text...  │  (scrollable)
│  ┌─ read: src/auth.ts ────────┐ │
│  │ ...file contents...        │ │  Tool call cards
│  └────────────────────────────┘ │
│                                 │
├─────────────────────────────────┤
│  Ask anything...           📎 🔼 │  Input area
└─────────────────────────────────┘
```

### Elements

- **Header bar:** Extension name + icon, settings gear button
- **Message list:** User/assistant bubbles, streaming text rendering, collapsible tool call cards showing tool name and result
- **Input area:** Text input, attachment button for adding files as context, send button, Enter to send / Shift+Enter for newline
- **Tool call cards:** Each card shows the tool name and parameters compactly, expandable to show full result. Color-coded: read=blue, write=green, edit=yellow, bash=gray
- **Diff previews:** Triggered by the agent's edits, shown as native VS Code diff views (not reimplemented in webview)
- **Settings button:** Opens a quick-pick menu for provider, model, and API key

### Entry Points

| Entry Point | Trigger |
|-------------|---------|
| Sidebar icon | Click the SL's PI icon in the activity bar |
| Command palette | `Ctrl+Shift+P` → "SL's PI: Open Chat" |
| Context menu (file) | Right-click file → "SL's PI: Explain this file" |
| Context menu (selection) | Right-click selection → "SL's PI: Explain" / "SL's PI: Fix" / "SL's PI: Refactor" |
| Keyboard shortcut | User-configurable (default: none, suggested `Ctrl+Shift+L`) |

### Context Menu Actions

When a context menu action is used, the chat panel opens with a pre-filled prompt:
- **Explain this file:** "Explain what this file does: {filepath}"
- **Explain selection:** "Explain this code: {selected text}"
- **Fix selection:** "Fix this code: {selected text}"
- **Refactor selection:** "Refactor this code: {selected text}"

---

## Error Handling

| Error Category | Handling |
|---------------|----------|
| LLM rate limit | Inline error in chat with "Retry" button and wait time |
| LLM auth failure | Inline error guiding user to check API key |
| LLM timeout | Inline error with retry |
| Tool: file not found | Result returned to agent loop so it can self-correct |
| Tool: permission denied | Result returned to agent loop |
| Tool: shell non-zero exit | stdout+stderr + exit code returned to agent loop |
| Tool: bash timeout | Process killed, partial output + timeout error returned |
| Streaming interrupted | Agent loop finishes current turn, result stored |
| Large outputs | Truncated with "Show full output" toggle in tool card |

---

## Configuration (VS Code Settings)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sls-pi.provider` | string | `"anthropic"` | LLM provider: "anthropic" or "openai-compatible" |
| `sls-pi.model` | string | `"claude-sonnet-4-20250514"` | Model ID |
| `sls-pi.apiEndpoint` | string | `""` | Base URL for openai-compatible provider |
| `sls-pi.maxTokens` | number | `8192` | Max tokens per response |
| `sls-pi.toolTimeout` | number | `120` | Max seconds for bash commands |
| `sls-pi.skillsPath` | string | `""` | Override skill directory (empty = use bundled) |

### API Key Storage

API keys are stored via `vscode.SecretStorage`. Set with command `SL's PI: Set API Key`. The extension prompts on first use if no key is found.

---

## Project Structure

```
sls-pi/
├── package.json              # VS Code extension manifest
├── tsconfig.json
├── src/
│   ├── extension.ts          # Activation entry point
│   ├── agent/
│   │   ├── loop.ts           # Agent loop orchestration
│   │   ├── system-prompt.ts  # System prompt assembly
│   │   └── history.ts        # Conversation history management
│   ├── tools/
│   │   ├── registry.ts       # Tool registration and dispatch
│   │   ├── read.ts           # Read file tool
│   │   ├── write.ts          # Write file tool
│   │   ├── edit.ts           # Edit file tool
│   │   └── bash.ts           # Bash/shell tool
│   ├── providers/
│   │   ├── types.ts          # LLM provider interface
│   │   ├── anthropic.ts      # Anthropic API provider
│   │   └── openai-compat.ts  # OpenAI-compatible provider
│   ├── skills/
│   │   └── loader.ts         # Skill loading and matching
│   ├── chat/
│   │   └── panel.ts          # Webview panel management
│   └── config.ts             # VS Code settings + secrets access
├── skills/                   # Bundled skill definitions
│   └── ... (from pi/agent/skills)
├── webview/
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx           # React app root
│   │   ├── ChatView.tsx      # Message list component
│   │   ├── InputBox.tsx      # Input area component
│   │   ├── ToolCard.tsx      # Tool call card component
│   │   └── types.ts          # Webview message types
│   └── package.json
└── README.md
```

---

## Testing

| Layer | Approach |
|-------|----------|
| Tool implementations | Unit tests with mocked VS Code API |
| Agent loop | Unit tests with mocked LLM provider |
| LLM providers | Integration tests with recorded API responses |
| Webview UI | Manual testing + VS Code extension test runner |
| Skills loading | Unit tests verifying skill file parsing |
| End-to-end | VS Code integration test that opens chat, sends message, verifies response |

---

## Distribution

- Packaged as a `.vsix` file for installation
- Published to VS Code Marketplace (optional, future consideration)
- No external dependencies beyond what's bundled
- Minimum VS Code version: 1.85+

---

## Out of Scope (v1)

- Image generation or multimodal input beyond image file reading
- Voice input/output
- Session persistence across VS Code restarts
- Multi-workspace chat context sharing
- Custom tool plugins
- Telemetry or analytics
