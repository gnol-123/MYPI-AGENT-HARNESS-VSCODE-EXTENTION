import { exec, ExecException } from 'child_process';
import { ToolHandler, ToolResult } from './types';

const DEFAULT_TIMEOUT = 120_000;
const MAX_OUTPUT = 50 * 1024;
const MAX_LINES = 2000;

let activeCwd: string | undefined;

export function setBashCwd(cwd: string): void {
  activeCwd = cwd;
}

export function getBashCwd(): string {
  return activeCwd || process.cwd();
}

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
  description: 'Execute a bash command in the current working directory. Output is truncated to 2000 lines or 50KB.',
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
        maxBuffer: 10 * 1024 * 1024,
        cwd: activeCwd || process.cwd(),
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
