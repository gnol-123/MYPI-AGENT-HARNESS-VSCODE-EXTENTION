import { Message } from '../providers/types';

/** Compact once the prompt reaches this fraction of the model's window. */
export const COMPACT_THRESHOLD = 0.8;

/** Recent turns kept verbatim so the agent does not lose its immediate footing. */
const KEEP_TAIL = 4;

/** Below this many droppable messages, compaction costs more than it saves. */
const MIN_DROP = 2;

/**
 * Real token counts only arrive with the response, which is too late to stop
 * the request that overflows. ~4 chars per token is close enough to fire a
 * threshold, and it errs high on JSON, which is what tool calls are made of.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: Message[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') {
      chars += m.content.length;
      continue;
    }
    for (const block of m.content) {
      if (block.text) chars += block.text.length;
      if (block.input) chars += JSON.stringify(block.input).length;
      if (block.content) chars += block.content.length;
    }
  }
  return Math.ceil(chars / 4);
}

export interface CompactionPlan {
  /** The original task. Always survives. */
  keepHead: Message[];
  /** Replaced by a single summary message. */
  drop: Message[];
  /** Recent turns, kept verbatim. */
  keepTail: Message[];
}

/**
 * Decides what to compact, or undefined when it is not worth it.
 *
 * Whole messages only: an assistant message carries its tool_use blocks *and*
 * their tool_result blocks, so slicing inside one would orphan a tool call and
 * the provider would reject the request.
 */
export function planCompaction(
  messages: Message[],
  promptTokens: number,
  contextWindow: number,
): CompactionPlan | undefined {
  if (messages.length < 2) return undefined;
  if (promptTokens < COMPACT_THRESHOLD * contextWindow) return undefined;

  const keepHead = messages.slice(0, 1);
  const tailStart = Math.max(1, messages.length - KEEP_TAIL);
  const drop = messages.slice(1, tailStart);
  const keepTail = messages.slice(tailStart);

  if (drop.length < MIN_DROP) return undefined;

  return { keepHead, drop, keepTail };
}

/** The transcript handed to the model when asking for a summary. */
export function renderForSummary(messages: Message[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      parts.push(`${m.role}: ${m.content}`);
      continue;
    }
    for (const block of m.content) {
      if (block.type === 'text' && block.text) parts.push(`${m.role}: ${block.text}`);
      else if (block.type === 'tool_use') parts.push(`${m.role} called ${block.name}(${JSON.stringify(block.input).slice(0, 200)})`);
      else if (block.type === 'tool_result') {
        const body = (block.content ?? '').slice(0, 300);
        parts.push(`tool result${block.is_error ? ' (error)' : ''}: ${body}`);
      }
    }
  }
  return parts.join('\n');
}

export const SUMMARY_PROMPT = `Summarize the conversation above so another engineer can pick the work up cold. Be specific and factual; this replaces the transcript, so anything you omit is lost.

Cover, as compact prose or short bullets:
- The user's goal, in their words.
- What was found: root causes, key file paths, decisions taken and why.
- What was changed: files edited, commands run that mattered.
- What is still outstanding, and the immediate next step.

Do not include pleasantries, tool-call syntax, or anything the next step does not need. Output only the summary.`;

/** Splices the summary between the retained head and tail. */
export function buildCompactedHistory(plan: CompactionPlan, summary: string): Message[] {
  const summaryMessage: Message = {
    role: 'assistant',
    content:
      `<compacted_history turns="${plan.drop.length}">\n${summary}\n</compacted_history>\n` +
      'The above summarizes earlier turns that were compacted away to fit the context window. Continue from here.',
  };
  return [...plan.keepHead, summaryMessage, ...plan.keepTail];
}
