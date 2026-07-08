#!/usr/bin/env node
// context7.mjs - fetch up-to-date library docs from the Context7 API.
// Usage:
//   node context7.mjs search <libraryName> [natural language query]
//   node context7.mjs docs <libraryId> [question] [--json] [--tokens N]
//
// API key resolution order:
//   1. CONTEXT7_API_KEY environment variable
//   2. ~/.pi/agent/context7-key.txt  (single line: ctx7sk-...)
// Get a free key at https://context7.com/dashboard

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = "https://context7.com/api/v2";

function getApiKey() {
  if (process.env.CONTEXT7_API_KEY && process.env.CONTEXT7_API_KEY.trim()) {
    return process.env.CONTEXT7_API_KEY.trim();
  }
  const keyFile = join(homedir(), ".pi", "agent", "context7-key.txt");
  if (existsSync(keyFile)) {
    const k = readFileSync(keyFile, "utf8").trim();
    if (k) return k;
  }
  return null;
}

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function usage() {
  console.log(`context7 - up-to-date library documentation

Commands:
  search <libraryName> [query]     Find a library and its Context7 ID
  docs <libraryId> [question]      Fetch docs for a library ID (e.g. /vercel/next.js)

Options for docs:
  --json                           Return raw JSON (code + info snippets)
  --tokens <N>                     Approx. token budget for the docs (default: server default)

Examples:
  node context7.mjs search react "manage global state"
  node context7.mjs docs /vercel/next.js "app router middleware auth"
`);
}

async function api(path, params, apiKey) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.status === 401 || res.status === 403) {
    fail("Context7 rejected the API key (401/403). Check CONTEXT7_API_KEY or ~/.pi/agent/context7-key.txt. Keys start with 'ctx7sk-'.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail(`Context7 API error ${res.status}: ${body.slice(0, 500)}`);
  }
  return res;
}

async function cmdSearch(args, apiKey) {
  const libraryName = args[0];
  if (!libraryName) fail("Usage: search <libraryName> [query]");
  const query = args.slice(1).filter((a) => !a.startsWith("--")).join(" ");
  const res = await api("/libs/search", { libraryName, query }, apiKey);
  const data = await res.json();
  const results = data.results || data.libraries || [];
  if (!results.length) {
    console.log(`No libraries found for "${libraryName}".`);
    return;
  }
  console.log(`Top matches for "${libraryName}":\n`);
  for (const r of results.slice(0, 10)) {
    const id = r.id || r.libraryId || r.settings?.project || "?";
    const shortId = id.replace(/^\//, ""); // shell-safe form (no leading slash)
    const title = r.title || r.name || "";
    const desc = (r.description || "").replace(/\s+/g, " ").slice(0, 120);
    const trust = r.trustScore != null ? ` trust:${r.trustScore}` : "";
    const snip = r.totalSnippets != null ? ` snippets:${r.totalSnippets}` : "";
    console.log(`  ${shortId}`);
    if (title) console.log(`    ${title}${trust}${snip}`);
    if (desc) console.log(`    ${desc}`);
  }
  console.log(`\nNext: node context7.mjs docs <id> "your question"   (id without leading slash, e.g. vercel/next.js)`);
}

// On Git Bash / MSYS (Windows), a leading-slash arg like "/vercel/next.js" is
// auto-converted to a Windows path before it reaches Node. Accept ids without a
// leading slash and add it back here so callers can safely pass "vercel/next.js".
function normalizeLibraryId(id) {
  if (!id) return id;
  if (/^[a-zA-Z]:[\\/]/.test(id) || id.includes("\\")) {
    fail(
      `The library id "${id}" looks like it was mangled by the shell into a filesystem path.\n` +
        `Pass the id WITHOUT a leading slash, e.g.  docs vercel/next.js  (not /vercel/next.js).`,
    );
  }
  return id.startsWith("/") ? id : "/" + id;
}

async function cmdDocs(args, apiKey) {
  const positional = [];
  let json = false;
  let tokens;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") json = true;
    else if (args[i] === "--tokens") tokens = args[++i];
    else positional.push(args[i]);
  }
  const libraryId = normalizeLibraryId(positional[0]);
  if (!positional[0]) fail("Usage: docs <libraryId> [question] [--json] [--tokens N]");
  const query = positional.slice(1).join(" ");
  const res = await api(
    "/context",
    { libraryId, query, tokens, type: json ? "json" : "txt" },
    apiKey,
  );
  const text = await res.text();
  if (json) {
    console.log(text);
    return;
  }
  // txt mode returns readable documentation directly
  console.log(text.trim() || "(no documentation returned)");
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    usage();
    process.exit(0);
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    fail(
      "No Context7 API key found.\n" +
        "Set one of:\n" +
        "  - environment variable CONTEXT7_API_KEY=ctx7sk-...\n" +
        "  - file ~/.pi/agent/context7-key.txt containing the key\n" +
        "Get a free key at https://context7.com/dashboard",
    );
  }
  if (cmd === "search") await cmdSearch(rest, apiKey);
  else if (cmd === "docs") await cmdDocs(rest, apiKey);
  else fail(`Unknown command: ${cmd}\nRun with --help for usage.`);
}

main().catch((e) => fail(`Error: ${e.message || e}`));
