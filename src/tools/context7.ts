import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';
import { ToolHandler, ToolResult } from './types';

function getContext7ScriptPath(): string {
  // When running in the extension, skills are at extensionPath/skills
  // Try to resolve relative to the current working directory first
  const cwd = process.cwd();
  const fromCwd = path.join(cwd, 'skills', 'context7', 'context7.mjs');
  if (fs.existsSync(fromCwd)) return fromCwd;

  // Fallback: check relative to __dirname (out/ directory)
  const fromOut = path.join(__dirname, '..', 'skills', 'context7', 'context7.mjs');
  if (fs.existsSync(fromOut)) return fromOut;

  return fromCwd; // Return best guess, let the error surface
}

function getApiKey(): string | null {
  if (process.env.CONTEXT7_API_KEY?.trim()) {
    return process.env.CONTEXT7_API_KEY.trim();
  }
  const keyFile = path.join(homedir(), '.pi', 'agent', 'context7-key.txt');
  if (fs.existsSync(keyFile)) {
    const k = fs.readFileSync(keyFile, 'utf8').trim();
    if (k) return k;
  }
  return null;
}

export const context7Tool: ToolHandler = {
  name: 'context7',
  description: 'Fetch up-to-date, version-specific documentation and code examples for any library, framework, SDK, API, CLI tool, or cloud service from the Context7 API. Use whenever the user asks how to use a library or for current API syntax.',
  parameters: {
    type: 'object',
    required: ['command', 'args'],
    properties: {
      command: {
        type: 'string',
        enum: ['search', 'docs'],
        description: 'Command: "search" to find a library, "docs" to fetch documentation for a library ID',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Arguments: for search: [libraryName, query?]; for docs: [libraryId, question?, --json?, --tokens N?]',
      },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const command = params.command as string;
    const args = (params.args as string[]) || [];

    if (!command) return { content: '', error: 'Missing required parameter: command (search or docs)' };
    if (!['search', 'docs'].includes(command)) return { content: '', error: `Unknown command: ${command}. Use "search" or "docs".` };

    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        content: '',
        error: 'No Context7 API key found. Set CONTEXT7_API_KEY environment variable or create ~/.pi/agent/context7-key.txt. Get a free key at https://context7.com/dashboard',
      };
    }

    const scriptPath = getContext7ScriptPath();
    if (!fs.existsSync(scriptPath)) {
      return { content: '', error: `Context7 script not found at ${scriptPath}` };
    }

    const escapedArgs = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ');
    const cmd = `node "${scriptPath}" ${command} ${escapedArgs}`;

    return new Promise((resolve) => {
      exec(cmd, {
        timeout: 30000,
        maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, CONTEXT7_API_KEY: apiKey },
      }, (error, stdout, stderr) => {
        const output = stdout.trim();
        const errors = stderr.trim();

        if (error) {
          resolve({
            content: errors || output || '(no output)',
            error: `Context7 command failed (exit ${error.code}): ${error.message}`,
          });
        } else {
          resolve({
            content: output || errors || '(no results)',
          });
        }
      });
    });
  },
};
