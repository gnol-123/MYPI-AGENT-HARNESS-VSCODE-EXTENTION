import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
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
- For hard-to-reverse or outward-facing actions (deleting files, pushing, publishing), confirm first unless clearly authorized.
`;

// Injected in code, not SYSTEM.md, so it applies no matter which harness file
// a machine loads (live ~/.pi/agent copies drift from the bundled snapshot).
const CORE_BEHAVIOR = `

# Core behavior
- Task management: use the todo_write tool VERY frequently — it is how the user tracks your progress. For any task with 2+ steps, write the full list BEFORE starting work. Mark exactly one item in_progress before you begin it, and mark it completed IMMEDIATELY when it is done — never batch completions until the end. Add newly discovered work as new items instead of keeping it in your head.
- Proactiveness: when asked to do something, do it fully, including directly implied follow-ups. When asked a question, answer it first — do not jump to editing files the user did not ask you to touch.
- Batching: you may request multiple tool calls in a single turn. When actions are independent (reading several files, running unrelated commands), batch them in one turn instead of one at a time — every extra round-trip costs the user seconds.
- Security: assist with defensive security tasks only. Refuse to create, improve, or explain code intended for malicious use.
- Git: commit frequently as you complete logical units of work; do not wait until the whole task is finished. Keep messages short with a TYPE: header (e.g. "FIX: ..."). Never add yourself as a co-author. Do not push unless asked. This supersedes any earlier instruction to avoid committing without being asked.
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

### todo_write
Update your live task list. Pass the complete list each call; it replaces the previous one and is rendered to the user as a pinned checklist.
`;

export function piAgentDir(): string {
  return path.join(os.homedir(), '.pi', 'agent');
}

interface PiHarness {
  system?: string;
  agents?: string;
}

let cachedHarness: PiHarness | undefined;
let bundledHarnessDir: string | undefined;

/** Called from activate() with <extension>/harness so shipped installs work without ~/.pi. */
export function setBundledHarnessDir(dir: string): void {
  bundledHarnessDir = dir;
  cachedHarness = undefined;
}

/** Reads SYSTEM.md and AGENTS.md from ~/.pi/agent so MYPI runs the same harness as local PI. */
export function loadPiHarness(): PiHarness {
  if (cachedHarness) return cachedHarness;
  const harness: PiHarness = {};
  // Live ~/.pi/agent wins (the dev machine); bundled copies make shipped installs self-contained.
  const sources = [piAgentDir(), bundledHarnessDir].filter((d): d is string => !!d);
  for (const [key, file] of [['system', 'SYSTEM.md'], ['agents', 'AGENTS.md']] as const) {
    for (const dir of sources) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8').trim();
        if (content) {
          harness[key] = content;
          break;
        }
      } catch {
        // Try the next source.
      }
    }
  }
  cachedHarness = harness;
  return harness;
}

/** Test hook / used when the user edits ~/.pi/agent files mid-session. */
export function resetHarnessCache(): void {
  cachedHarness = undefined;
  cachedEnvironment = undefined;
  cachedWorkspaceInstructions = undefined;
}

let workspaceRoot: string | undefined;
let cachedEnvironment: string | undefined;
let cachedWorkspaceInstructions: string | undefined;

/** Called from activate() with the first workspace folder. */
export function setWorkspaceRoot(dir: string | undefined): void {
  workspaceRoot = dir;
  cachedEnvironment = undefined;
  cachedWorkspaceInstructions = undefined;
}

function git(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      timeout: 1500,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Claude Code parity: cwd, OS, date, and a git snapshot in the prompt save the
 * model a whole tool-call round-trip on most first turns. Snapshotted once per
 * session — both to keep git off the per-message hot path and to keep the
 * prompt byte-stable for provider-side prompt caching.
 */
function buildEnvironmentContext(): string {
  if (cachedEnvironment !== undefined) return cachedEnvironment;
  const cwd = workspaceRoot || process.cwd();

  const lines = [
    `Working directory: ${cwd}`,
    `Platform: ${process.platform} (${os.release()})`,
    `Today's date: ${new Date().toISOString().slice(0, 10)}`,
  ];

  const branch = git('branch --show-current', cwd);
  if (branch) {
    lines.push(`Git branch: ${branch}`);
    const status = git('status --short', cwd);
    const statusLines = status ? status.split('\n') : [];
    const shown = statusLines.slice(0, 20).join('\n');
    const more = statusLines.length > 20 ? `\n(+${statusLines.length - 20} more)` : '';
    lines.push(`Git status (snapshot at session start — may be stale):\n${shown || '(clean)'}${more}`);
    const log = git('log --oneline -5', cwd);
    if (log) lines.push(`Recent commits:\n${log}`);
  } else {
    lines.push('Git: not a repository');
  }

  cachedEnvironment = lines.join('\n');
  return cachedEnvironment;
}

/** The workspace's own CLAUDE.md / AGENTS.md — per-project memory, like Claude Code. */
function loadWorkspaceInstructions(): string {
  if (cachedWorkspaceInstructions !== undefined) return cachedWorkspaceInstructions;
  let out = '';
  if (workspaceRoot) {
    for (const name of ['CLAUDE.md', 'AGENTS.md']) {
      const filePath = path.join(workspaceRoot, name);
      try {
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        if (content) {
          out += `\n<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n`;
        }
      } catch {
        // File absent — normal.
      }
    }
  }
  cachedWorkspaceInstructions = out;
  return out;
}

export function buildSystemPrompt(skills: Skill[], task?: string, thinkingEffort?: 'low' | 'medium' | 'high'): string {
  const harness = loadPiHarness();

  let prompt: string;
  if (harness.system) {
    prompt = harness.system;
    prompt += `\n\n# Environment\nYou are running as MYPI-by-SL inside a VS Code sidebar (not a terminal). The same tools are available: read, bash, edit, write, plus web_fetch and context7. Markdown output is rendered in the chat panel.`;
  } else {
    prompt = FALLBACK_PROMPT;
  }

  prompt += TOOLS_SECTION;
  prompt += CORE_BEHAVIOR;
  prompt += `\n# Environment (snapshot at session start)\n${buildEnvironmentContext()}\n`;

  if (harness.agents) {
    prompt += `\n<user_instructions path="~/.pi/agent/AGENTS.md">\n${harness.agents}\n</user_instructions>\n`;
  }

  prompt += loadWorkspaceInstructions();

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

  // Thinking effort control
  if (thinkingEffort) {
    const effortInstructions: Record<string, string> = {
      low: 'THINKING EFFORT: LOW. Be extremely concise. Skip extensive planning/thinking - jump straight to actions. Use minimal tool iterations. Prefer single-pass solutions. Do NOT use thinking blocks or long chains of reasoning.',
      medium: 'Thinking effort: medium. Balance thoroughness with efficiency.',
      high: 'THINKING EFFORT: HIGH. Use extensive reasoning, chain-of-thought, and careful planning. Take your time to think deeply about the problem.',
    };
    prompt += `\n\n${effortInstructions[thinkingEffort] || ''}`;
  }

  return prompt;
}
