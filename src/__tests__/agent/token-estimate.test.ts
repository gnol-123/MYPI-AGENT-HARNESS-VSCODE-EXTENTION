import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateMessagesTokens } from '../../agent/compaction';
import { Message } from '../../providers/types';

/**
 * Compaction must decide BEFORE sending, but real token counts only arrive
 * with the response. A ~4-chars-per-token estimate is enough to fire the
 * threshold; it only has to be in the right neighbourhood, and it must never
 * wildly under-count (that would let a request overflow).
 */

describe('estimateTokens', () => {
  it('is roughly chars/4', () => {
    expect(estimateTokens('a'.repeat(400))).toBeGreaterThanOrEqual(100);
    expect(estimateTokens('a'.repeat(400))).toBeLessThan(140);
  });

  it('handles empty input', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('estimateMessagesTokens', () => {
  it('counts plain string content', () => {
    const msgs: Message[] = [{ role: 'user', content: 'x'.repeat(4000) }];
    expect(estimateMessagesTokens(msgs)).toBeGreaterThan(900);
  });

  it('counts tool_use inputs and tool_result bodies, which dominate real sessions', () => {
    const msgs: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'ok' },
          { type: 'tool_use', id: 't1', name: 'read', input: { path: 'a.ts' } },
          { type: 'tool_result', tool_use_id: 't1', content: 'y'.repeat(8000) },
        ],
      },
    ];
    // The 8000-char tool result must be reflected, not ignored.
    expect(estimateMessagesTokens(msgs)).toBeGreaterThan(1800);
  });

  it('grows with history length', () => {
    const one: Message[] = [{ role: 'user', content: 'z'.repeat(1000) }];
    const two: Message[] = [...one, { role: 'user', content: 'z'.repeat(1000) }];
    expect(estimateMessagesTokens(two)).toBeGreaterThan(estimateMessagesTokens(one));
  });

  it('is zero for an empty history', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});
