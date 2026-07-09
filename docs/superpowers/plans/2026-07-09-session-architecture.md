# Session Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-session persistent conversation memory with origin-pinned message routing, fixed tab close buttons, and Claude-style session slash commands (`/new`, `/resume`, `/clear`, `/help`).

**Architecture:** New host-side `SessionManager` owns `Map<sessionId, Session>` where each session holds display messages AND its own `ConversationHistory`. All webview↔host streaming messages carry `sessionId`; the webview drops events not matching the visible tab. `AgentLoop.run()` takes history as a parameter instead of creating one.

**Tech Stack:** TypeScript, VS Code extension API, React webview (esbuild), vitest.

## Global Constraints

- No theme/color/layout changes; reuse existing CSS variables and class names.
- Spec: `docs/superpowers/specs/2026-07-09-session-architecture-design.md`.
- Persistence key: `mypi-sessions-v2` in `globalState`; migrate old `mypi-sessions` read-only.
- Cap: serialize last 50 messages per session.
- Compile: `npx tsc -p ./tsconfig.json`; webview: `node esbuild.js`; tests: `npx vitest run`.

---

### Task 1: ConversationHistory serialization

**Files:**
- Modify: `src/agent/history.ts`
- Test: `src/__tests__/agent/history.test.ts`

**Produces:** `history.toJSON(): Message[]` and `ConversationHistory.fromJSON(msgs: Message[]): ConversationHistory`.

- [ ] Add test: round-trip user msg + assistant msg with tool_use + tool_result through `toJSON`/`fromJSON`, assert `getMessages()` deep-equals.
- [ ] Implement `toJSON()` (returns `this.getMessages()`) and static `fromJSON(msgs)` (new instance, assigns copy of msgs).
- [ ] `npx vitest run src/__tests__/agent/history.test.ts` → PASS. Commit.

### Task 2: AgentLoop takes external history

**Files:**
- Modify: `src/agent/loop.ts:50-55`
- Test: `src/__tests__/agent/loop.test.ts`

**Produces:** `run(history: ConversationHistory, userMessage: string, onEvent): Promise<void>` — appends to the given history, never creates one.

- [ ] Update signature; delete `const history = new ConversationHistory()`; keep `history.addUserMessage(userMessage)`.
- [ ] Update all existing loop tests to pass `new ConversationHistory()`.
- [ ] Add test: two sequential `run()` calls with same history → second provider call receives 3+ messages (context retained).
- [ ] `npx vitest run src/__tests__/agent/loop.test.ts` → PASS. Commit.

### Task 3: SessionManager

**Files:**
- Create: `src/chat/session-manager.ts`
- Test: `src/__tests__/chat/session-manager.test.ts`

**Produces:**

```ts
interface DisplayMessage { id: string; role: 'user'|'assistant'; content: string; timestamp: number }
interface Session { id: string; name: string; messages: DisplayMessage[]; history: ConversationHistory; createdAt: number; updatedAt: number }
class SessionManager {
  constructor(state?: vscode.Memento)   // optional for tests
  create(name?: string): Session        // becomes active
  get(id: string): Session | undefined
  delete(id: string): void              // keeps >=1 session; reassigns active
  list(): SessionInfo[]                 // sorted updatedAt desc
  get activeId(): string; setActive(id: string): void
  addMessage(sessionId: string, role, content: string): void  // auto-names session from 1st user msg (30 chars), bumps updatedAt, saves
  clear(sessionId: string): void        // wipes messages + history
  save(): void; load(): void            // mypi-sessions-v2; migrates mypi-sessions (rebuild history from messages)
}
```

- [ ] Tests: create/active; addMessage auto-name; two sessions have independent histories; delete active reassigns; delete last is no-op; clear empties both stores; save/load round-trip via fake Memento (`{get,update}` backed by an object); migration from old `mypi-sessions` shape (`{id,name,messages,createdAt}`) rebuilds history with user/assistant text turns; save caps messages at 50.
- [ ] Implement. `npx vitest run src/__tests__/chat/session-manager.test.ts` → PASS. Commit.

### Task 4: Protocol types + panel routing

**Files:**
- Modify: `webview/src/types.ts`, `src/chat/panel.ts`

**Interfaces:**
- Consumes: SessionManager (Task 3), `loop.run(history, text, onEvent)` (Task 2).
- Produces: `UserMessage`, `AssistantStreamChunk`, `ToolCallStart`, `AgentError`, `AgentDone` all gain `sessionId: string`; new `{ type: 'clearSession'; sessionId: string }` in `WebviewToHost`.

- [ ] Add `sessionId` to the five message types; add `clearSession`.
- [ ] Rewrite `ChatViewProvider` session code: delete `sessions` Map, `activeSessionId`, `loadSessions/saveSessions/createSession/deleteSession/getActiveSession/addMessageToSession`; hold `private sessionManager: SessionManager` (constructed in `setState`).
- [ ] `userMessage` handler: read `message.sessionId`, `const session = this.sessionManager.get(sessionId)` **once**; busy-guard `Map<string, boolean>` — if busy, post tagged error and return; write user msg + echo; call `this.agentLoop.run(session.history, text, cb)`; every posted event includes `sessionId: session.id`; on done/error write assistant msg to `session`, clear busy flag, `sendSessionsList()`.
- [ ] `newSession`/`switchSession`/`deleteSession`/`clearSession` handlers delegate to SessionManager then `sendSessionsList()` + `sendSessionMessages(activeId)`.
- [ ] `npx tsc -p ./tsconfig.json` → clean. `npx vitest run` → all pass. Commit.

### Task 5: Webview — tagged events, tab fix

**Files:**
- Modify: `webview/src/App.tsx`

- [ ] `sendMessage` posts `{ type:'userMessage', text, sessionId: activeSessionId }`.
- [ ] Handler: for `assistantStreamChunk`/`toolCallStart`/`done`/`error` — `if (msg.sessionId && msg.sessionId !== activeSessionId) break;` (add `activeSessionId` to the effect dep array).
- [ ] Tab styles: name span `flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis'`; close X `flexShrink:0`, base opacity 0.5 (remove the hover-only reveal), keep hover CSS.
- [ ] `node esbuild.js` → builds. Commit.

### Task 6: Slash commands + history & help panels

**Files:**
- Modify: `webview/src/InputBox.tsx`, `webview/src/App.tsx`

**Interfaces:** InputBox gains props `onNewSession(): void`, `onShowHistory(): void`, `onClearSession(): void`, `onShowHelp(): void` (wired in App to postMessage / local panel state).

- [ ] Add to `SLASH_COMMANDS` (with `action` field handled in `insertCommand`, like `/model`): `/new`, `/resume`, `/clear`, `/help`.
- [ ] History panel in App: overlay above input (reuse `styles.popup` family from InputBox — lift shared popup styles or duplicate minimal styles); lists `sessions` (name, `messageCount` msgs, relative time via `Date.now()-createdAt`); click → `switchSession(id)`; Escape closes. Opened by `/resume` and a `⟲` header button next to `+`.
- [ ] Help panel in App: same overlay family; sections — Commands (table of all slash commands + descriptions), Keybindings (Enter send, Shift+Enter newline, / commands), Status (model, provider, cwd, tokens from `agentStatus`), button "Set API Key" → `runCommand mypi-by-sl.setApiKey`. Opened by `/help`.
- [ ] `node esbuild.js` → builds. Commit.

### Task 7: Wire-up, package, verify

**Files:**
- Modify: `src/extension.ts`, `package.json`

- [ ] `extension.ts`: no API change needed beyond Task 4 compile fixes (ensureAgentLoop unchanged; `openChat` unchanged).
- [ ] Bump version 0.1.2 → 0.2.0.
- [ ] `npx vitest run` → all pass; `npx tsc -p ./tsconfig.json` → clean; `node esbuild.js` → builds.
- [ ] `npx @vscode/vsce package --allow-star-activation`; `code --install-extension mypi-by-sl-0.2.0.vsix --force`.
- [ ] Commit. Hand to user for manual verification: two tabs, send in A, switch to B mid-stream → reply stays in A; follow-up prompt remembers context; X closes named tabs; `/resume`, `/help`, `/clear`, `/new` work; restart VS Code → sessions restored.
