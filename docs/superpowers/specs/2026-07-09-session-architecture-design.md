# MYPI Session Architecture — Design Spec

**Date:** 2026-07-09
**Status:** Approved by SL

## Problem

Four confirmed defects in the chat core:

1. **Cross-session response bleed.** `panel.ts` resolves the target session via mutable
   `this.activeSessionId` at write time (`getActiveSession()` at lines 270/310). The webview's
   `userMessage` carries no session id, so a reply started in session A lands in whichever
   session is active when the awaited `agentLoop.run()` completes. Stream chunks are likewise
   untagged, so the visible transcript streams into whatever tab is open.
2. **No agent memory.** `AgentLoop.run()` constructs a fresh `ConversationHistory` per turn
   (loop.ts:54). Follow-up prompts have no context.
3. **Tab close button unclickable once a session is named.** The name span in `App.tsx` has no
   flex constraints inside a `maxWidth:120px; overflow:hidden` tab, so long names push the X
   outside the clip region.
4. **Slash menu lacks session commands** (`/new`, `/resume`, `/clear`, `/help`).

## Decisions (user-confirmed)

- Full per-session conversation history, **persisted** to `globalState` (survives restart).
- Slash commands modeled on the Claude VS Code extension: `/help` shows usage, settings,
  current model/provider/cwd/tokens; plus `/new`, `/resume`, `/clear`; keep `/model`, `/cd`.
- Session history (`/resume`) is an **inline themed dropdown panel**.
- **No theme changes.** Existing CSS variables and Catppuccin-style palette untouched.

## Architecture

### SessionManager (new, host side — `src/chat/session-manager.ts`)

Owns all session state. Single source of truth.

```ts
interface Session {
  id: string;
  name: string;
  messages: DisplayMessage[];       // what the webview renders
  history: ConversationHistory;     // what the LLM sees (tool_use blocks included)
  createdAt: number;
  updatedAt: number;
}
```

API: `create(name?)`, `get(id)`, `delete(id)`, `list()` (sorted by updatedAt desc),
`activeId` get/set, `addMessage(sessionId, role, content)`, `save()`, `load()`.

Persistence: serialized to `globalState` under `mypi-sessions-v2` (new key — old
`mypi-sessions` data lacks history and is migrated read-only: messages imported, history
rebuilt from messages as plain user/assistant text turns). Tool-use blocks are serialized
with the history so context survives restart. A cap (last 50 messages per session serialized)
guards against unbounded growth.

### Message routing — pin to origin

- `userMessage` from webview carries `sessionId`.
- Host captures the `Session` object **once** at the top of the handler; all writes
  (user message, assistant reply) go to that captured session.
- All streamed events to the webview are tagged: `assistantStreamChunk`, `toolCallStart`,
  `error`, `done` each carry `sessionId`.
- Webview drops streaming events whose `sessionId !== activeSessionId` (they still land in
  the stored session server-side; switching back re-renders from `sessionMessages`).
- On `done` for a background session, host pushes an updated `sessionsList` so the tab shows
  the new message count.

### AgentLoop — external history

`run(history: ConversationHistory, userMessage, onEvent)` — history is passed in, owned by
the session. The loop appends to it; nothing is discarded. One `AgentLoop` instance is still
shared (it is stateless apart from token counters); per-session isolation lives in the history.

### Concurrency guard

`Map<sessionId, boolean>` of in-flight requests in the panel. A second send into a busy
session is rejected with a themed inline error. Sends into *different* sessions run
concurrently.

### Tab fix (webview)

Name span: `flex: 1; minWidth: 0; overflow: hidden; textOverflow: ellipsis`.
Close X: `flexShrink: 0`, always rendered (small, dimmed; full opacity on hover).

### Slash commands

Handled in the webview where possible; session ops post typed messages to the host.

| Command | Behavior |
|---|---|
| `/new` | posts `newSession` |
| `/resume` | opens the session history panel |
| `/clear` | posts `clearSession` (host wipes messages + history for active session) |
| `/help` | opens inline help panel: command list, keybindings, model, provider, cwd, token usage, Set API Key button |
| `/model` | existing model picker (unchanged) |
| `/cd` | existing cwd handler (unchanged) |

Prompt-template commands (`/fix`, `/explain`, …) remain as-is.

### Session history panel (`/resume` + header button)

Inline overlay above the input (same styling family as the existing slash popup):
session name, message count, relative timestamp; click to switch; Escape closes.
Data comes from the existing `sessionsList` message — no new host round-trip.

## Message protocol changes (`webview/src/types.ts`)

- `UserMessage` gains `sessionId: string`.
- `AssistantStreamChunk`, `ToolCallStart`, `AgentError`, `AgentDone` gain `sessionId: string`.
- New `WebviewToHost`: `{ type: 'clearSession'; sessionId: string }`.
- `AgentStatus` already exists; `/help` reuses it.

## Error handling

- Send into busy session → inline error, message not lost (input retains text).
- Agent error mid-stream → tagged error event; stored in the *origin* session as an
  assistant message suffix, matching current behavior.
- `globalState` write failures are non-fatal (log, continue in memory).

## Testing

- `session-manager.test.ts`: create/switch/delete/persist/migrate; history isolation
  between two sessions; message cap.
- `loop.test.ts` updated: history passed in is appended to, not replaced.
- Routing test: simulate active-session switch mid-run; assert reply lands in origin session.

## Out of scope

Themes/colors/layout, providers, tools, the activity-bar icon, webview React framework.
