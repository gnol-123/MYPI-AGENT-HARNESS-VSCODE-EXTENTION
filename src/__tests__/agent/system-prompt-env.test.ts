import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  buildSystemPrompt,
  setWorkspaceRoot,
  resetHarnessCache,
} from '../../agent/system-prompt';

/**
 * Parity gaps vs Claude Code: the model used to burn its first tool calls on
 * `pwd` / `git status` because the prompt carried no environment context, and
 * it never saw the workspace's own CLAUDE.md / AGENTS.md.
 */

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mypi-prompt-test-'));
});

afterEach(() => {
  setWorkspaceRoot(undefined);
  resetHarnessCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('environment context', () => {
  it('includes working directory, platform, and date', () => {
    setWorkspaceRoot(tmpDir);
    const prompt = buildSystemPrompt([]);

    expect(prompt).toContain('# Environment');
    expect(prompt).toContain(`Working directory: ${tmpDir}`);
    expect(prompt).toContain(`Platform: ${process.platform}`);
    expect(prompt).toContain(`Today's date: ${new Date().toISOString().slice(0, 10)}`);
  });

  it('reports non-repo directories as such instead of failing', () => {
    setWorkspaceRoot(tmpDir);
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain('Git: not a repository');
  });

  it('includes the git branch when the workspace is a repository', () => {
    // The test suite itself runs inside this repo — use it as the fixture.
    setWorkspaceRoot(process.cwd());
    const prompt = buildSystemPrompt([]);
    expect(prompt).toMatch(/Git branch: \S+/);
    expect(prompt).toContain('Recent commits:');
  });

  it('is cached: two builds in a row reuse the same snapshot', () => {
    setWorkspaceRoot(process.cwd());
    const a = buildSystemPrompt([]);
    const b = buildSystemPrompt([]);
    // Identical output implies the git snapshot was not re-run mid-session,
    // which also keeps the prompt byte-stable for provider-side caching.
    expect(a).toBe(b);
  });
});

describe('workspace instructions', () => {
  it('injects the workspace CLAUDE.md and AGENTS.md as project instructions', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'Always use tabs in this project.');
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), 'Run make lint before committing.');
    setWorkspaceRoot(tmpDir);

    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain('Always use tabs in this project.');
    expect(prompt).toContain('Run make lint before committing.');
    expect(prompt).toContain(`<project_instructions path="${path.join(tmpDir, 'CLAUDE.md')}">`);
  });

  it('omits the block when the workspace has no instruction files', () => {
    setWorkspaceRoot(tmpDir);
    const prompt = buildSystemPrompt([]);
    expect(prompt).not.toContain(`<project_instructions path="${path.join(tmpDir, 'CLAUDE.md')}"`);
  });
});

describe('core behavior guidance', () => {
  it('always carries batching, proactiveness, security, and git-commit policy', () => {
    setWorkspaceRoot(tmpDir);
    const prompt = buildSystemPrompt([]);

    // Batch independent tool calls — the loop supports multiple per turn.
    expect(prompt).toMatch(/batch|single turn/i);
    // Defensive-security boundary.
    expect(prompt).toMatch(/defensive security/i);
    // Answer questions instead of jumping to edits.
    expect(prompt).toMatch(/answer it first/i);
    // The user's explicit policy: commit frequently, never as co-author. The
    // code-injected section must also override any stale SYSTEM.md wording.
    expect(prompt).toMatch(/commit frequently/i);
    expect(prompt).toMatch(/co-author/i);
    expect(prompt).toMatch(/supersedes any earlier instruction/i);
  });
});
