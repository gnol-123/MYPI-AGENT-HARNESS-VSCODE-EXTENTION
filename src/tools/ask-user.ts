import { ToolHandler, ToolResult } from './types';

export interface AskOption {
  label: string;
  description: string;
}

export interface AskQuestion {
  question: string;
  header: string;
  options: AskOption[];
  multiSelect: boolean;
}

export interface AskAnswer {
  answers?: string[];
  /** True when the user typed their own answer rather than picking an option. */
  other?: boolean;
  /** True when the user dismissed the question or the run was aborted. */
  cancelled?: boolean;
}

/** Delivers the question to the webview and resolves when the user answers. */
export interface AskUserBridge {
  ask(question: AskQuestion): Promise<AskAnswer>;
}

let bridge: AskUserBridge | undefined;

export function setAskUserBridge(b: AskUserBridge): void {
  bridge = b;
}

/** Typed view of the model's payload, or undefined when malformed. */
export function parseQuestion(params: Record<string, unknown>): AskQuestion | undefined {
  const question = params.question;
  if (typeof question !== 'string' || !question.trim()) return undefined;

  const raw = params.options;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) return undefined;

  const options: AskOption[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const { label, description } = entry as Record<string, unknown>;
    if (typeof label !== 'string' || !label.trim()) return undefined;
    options.push({
      label: label.trim(),
      description: typeof description === 'string' ? description.trim() : '',
    });
  }

  const header = typeof params.header === 'string' ? params.header.trim() : '';
  return { question: question.trim(), header, options, multiSelect: params.multiSelect === true };
}

export const askUserTool: ToolHandler = {
  name: 'ask_user',
  description:
    'Ask the user to choose between options when you are blocked on a decision only they can make: ' +
    'one you cannot resolve from the request, the code, or a sensible default. ' +
    'The user picks an option or types their own answer, which is returned to you. ' +
    'Do NOT use this for choices with an obvious default or facts you can verify yourself — pick the obvious ' +
    'option and say so. Do not ask permission to begin work you were already asked to do. ' +
    'Requires 2 to 4 options; put your recommendation first and mark it "(Recommended)".',
  parameters: {
    type: 'object',
    required: ['question', 'options'],
    properties: {
      question: { type: 'string', description: 'The complete question, ending in a question mark' },
      header: { type: 'string', description: 'Very short label for the question, max ~12 chars (e.g. "Database")' },
      multiSelect: { type: 'boolean', description: 'Allow selecting several options (default false)' },
      options: {
        type: 'array',
        description: '2-4 distinct choices. An "Other" free-text box is always offered automatically.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short display text (1-5 words)' },
            description: { type: 'string', description: 'What choosing this means, and its trade-off' },
          },
          required: ['label', 'description'],
        },
      },
    },
  },

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    if (!bridge) {
      return { content: '', error: 'Cannot ask the user: no chat panel is attached.' };
    }

    const question = parseQuestion(params);
    if (!question) {
      return {
        content: '',
        error:
          'Invalid question payload. Expected { question: string, options: [{ label, description }] } ' +
          'with between 2 and 4 options, each having a non-empty label.',
      };
    }

    const answer = await bridge.ask(question);

    if (answer.cancelled) {
      return {
        content: '',
        error:
          'The user dismissed the question without answering. Do not ask again — ' +
          'proceed with the most sensible default and tell them what you chose.',
      };
    }

    const answers = (answer.answers ?? []).filter((a) => a.trim());
    if (answers.length === 0) {
      return { content: '', error: 'The user submitted an empty answer. Proceed with a sensible default.' };
    }

    const joined = answers.join(', ');
    const custom = answer.other ? ' (typed by the user, not one of your options)' : '';
    return { content: `The user answered "${question.question}": ${joined}${custom}` };
  },
};
