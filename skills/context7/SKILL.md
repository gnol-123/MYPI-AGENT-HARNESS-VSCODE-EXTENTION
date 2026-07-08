---
name: context7
description: Fetch up-to-date, version-specific documentation and code examples for any library, framework, SDK, API, CLI tool, or cloud service (React, Next.js, Prisma, Tailwind, Django, etc.) from the Context7 API. Use whenever the user asks how to use a library, for current API syntax, config, setup, migration, or library-specific debugging - even for well-known libraries, since training data may be stale. Prefer this over guessing from memory.
metadata:
  requires: node, CONTEXT7_API_KEY
---

# Context7

Up-to-date library documentation for LLMs. This is the pi-native equivalent of the Context7 MCP server (pi does not run MCP). It calls the Context7 HTTP API via a small Node script.

## When to use

Use this whenever a task involves a specific library, framework, SDK, API, CLI tool, or cloud service - API syntax, configuration, version migration, setup, or library-specific debugging. Use it even for libraries you think you know: your training data may be out of date. Do not use it for general programming concepts, business-logic debugging, or code with no external library involved.

## Setup (one time)

Requires a free Context7 API key (starts with `ctx7sk-`) from https://context7.com/dashboard.

Provide it either way:

```bash
# Option A: environment variable (recommended)
export CONTEXT7_API_KEY=ctx7sk-...        # add to your shell profile to persist

# Option B: key file
echo "ctx7sk-..." > ~/.pi/agent/context7-key.txt
```

## Usage

Two steps: resolve the library name to a Context7 ID, then fetch docs for that ID.

```bash
# 1. Find the library and its Context7 ID
node ~/.pi/agent/skills/context7/context7.mjs search next.js "app router"

# 2. Fetch focused docs for a resolved ID
node ~/.pi/agent/skills/context7/context7.mjs docs vercel/next.js "middleware authentication"
```

Options for `docs`:
- `--tokens <N>` — approximate size of the returned docs
- `--json` — raw JSON (`codeSnippets`, `infoSnippets`) instead of readable text

**Pass the library id WITHOUT a leading slash** (e.g. `vercel/next.js`, `websites/uploadcare_com`). Context7's canonical ids start with `/`, but on Git Bash / MSYS a leading-slash argument gets rewritten into a Windows path before the script sees it; the script adds the slash back for you. If the user already gave an exact id, skip the search and call `docs` directly. Always pass a specific `query` describing what you actually need so the returned docs are focused.

## Workflow

1. Identify the library the task depends on.
2. Run `search <name> "<what you need>"`, pick the best-matching `id` (prefer higher trust score and snippet count).
3. Run `docs <id> "<specific question>"` and read the result before writing code.
4. Use the returned, current API in your implementation.
