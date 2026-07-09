import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Skill } from '../skills/loader';

// Fallback used only when ~/.pi/agent is not available on this machine.
const FALLBACK_PROMPT = `You are MYPI-by-SL, a coding agent running inside VS Code. You help the user with software engineering tasks by reading files, running shell commands, editing code, and writing new files, all from within the editor.

## Tone and style
- Be concise, direct, and to the point. Match the length of your answer to the task.
- Minimize preamble and postamble. Do not open with "Great", "Certainly", "Sure", or restate the question back.
- Output is rendered as Markdown. Reference files as clickable paths.
- Explain non-trivial or state-changing shell commands before running them, so the user knows what will happen.
- Never fabricate results. If a test fails, say so and show the output.

## Skills come first
You have a library of skills telling you HOW to approach a task, and using them is not optional.
- Before acting, if there is even a small chance a skill applies, load it and announce "Using <skill> to <purpose>".
- Process skills come first and determine your approach: brainstorming before building anything new, systematic-debugging before fixing any bug, test-driven-development before writing implementation code, verification-before-completion before claiming done.
- The user's instructions always take precedence over any skill.

## Verification before completion
Before you claim something is done, fixed, working, or passing, actually verify it: run the build, run the tests, run the linter, or drive the affected flow end-to-end and observe the result. Evidence before assertions, always.

## Safety
- Do what has been asked; nothing more, nothing less.
- For hard-to-reverse or outward-facing actions (deleting files, committing, pushing), confirm first unless clearly authorized.
- Do not commit or push to git unless the user asks.
`;

const TOOLS_SECTION = `

## Tools

You have access to a set of tools to help answer the user's question:

### read
Read the contents of a file. Supports text files and images (jpg, png, gif, webp, bmp). Output is truncated to 2000 lines or 50KB.

### write
Write content to a file. Creates the file and parent directories if they don't exist.

### edit
Edit a single file using exact text replacement. Each edits[].oldText must match a unique, non-overlapping region of the original file.

### bash
Execute a shell command. Use bash for file operations like ls, rg, and find. Prefer rg (ripgrep) over grep, and read files directly with read rather than cat. Output is truncated to 2000 lines or 50KB.

### web_fetch
Fetch content from a URL and process it. Use for accessing API documentation, web pages, or any web resource.

### context7
Fetch up-to-date, version-specific documentation and code examples for any library, framework, SDK, API, CLI tool, or cloud service from the Context7 API. Use whenever the user asks how to use a library or for current API syntax.
`;

export function piAgentDir(): string {
  return path.join(os.homedir(), '.pi', 'agent');
}

interface PiHarness {
  system?: string;
  agents?: string;
}

let cachedHarness: PiHarness | undefined;

/** Reads SYSTEM.md and AGENTS.md from ~/.pi/agent so MYPI runs the same harness as local PI. */
export function loadPiHarness(): PiHarness {
  if (cachedHarness) return cachedHarness;
  const harness: PiHarness = {};
  for (const [key, file] of [['system', 'SYSTEM.md'], ['agents', 'AGENTS.md']] as const) {
    try {
      const content = fs.readFileSync(path.join(piAgentDir(), file), 'utf-8').trim();
      if (content) harness[key] = content;
    } catch {
      // File absent — fall back below.
    }
  }
  cachedHarness = harness;
  return harness;
}

/** Test hook / used when the user edits ~/.pi/agent files mid-session. */
export function resetHarnessCache(): void {
  cachedHarness = undefined;
}

export function buildSystemPrompt(skills: Skill[], task?: string): string {
  const harness = loadPiHarness();

  let prompt: string;
  if (harness.system) {
    prompt = harness.system;
    prompt += `\n\n# Environment\nYou are running as MYPI-by-SL inside a VS Code sidebar (not a terminal). The same tools are available: read, bash, edit, write, plus web_fetch and context7. Markdown output is rendered in the chat panel.`;
  } else {
    prompt = FALLBACK_PROMPT;
  }

  prompt += TOOLS_SECTION;

  if (harness.agents) {
    prompt += `\n<project_instructions path="~/.pi/agent/AGENTS.md">\n${harness.agents}\n</project_instructions>\n`;
  }

  if (skills.length > 0) {
    prompt += '\n\nThe following skills provide specialized instructions for specific tasks.\n';
    prompt += 'Use the read tool to load a skill\'s file when the task matches its description.\n\n';

    for (const skill of skills) {
      prompt += `<available_skill>\n`;
      prompt += `  <name>${skill.name}</name>\n`;
      prompt += `  <description>${skill.description}</description>\n`;
      prompt += `  <location>${skill.location}/SKILL.md</location>\n`;
      prompt += `</available_skill>\n`;
    }
  }

  if (task) {
    prompt += `\nCurrent task: ${task}`;
  }

  return prompt;
}
