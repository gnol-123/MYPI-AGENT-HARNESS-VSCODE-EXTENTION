import { describe, it, expect } from 'vitest';
import { planCompaction, buildCompactedHistory, COMPACT_THRESHOLD } from '../../agent/compaction';
import { Message } from '../../providers/types';

/**
 * Compaction replaces the oldest turns with one summary message.
 *
 * Two invariants make or break it:
 *  - never split an assistant message (its tool_use and tool_result live
 *    together, and an orphaned pair is a 400 from the API),
 *  - always keep the first user message: it is the task.
 */

function userMsg(text: string): Message {
  return { role: 'user', content: text };
}

function toolTurn(id: string): Message {
  return {
    role: 'assistant',
    content: [
      { type: 'text', text: 'working' },
      { type: 'tool_use', id, name: 'read', input: { path: 'a.ts' } },
      { type: 'tool_result', tool_use_id: id, content: 'contents' },
    ],
  };
}

/** 10 messages: user, then 4x (assistant tool turn + user). */
function longHistory(): Message[] {
  const msgs: Message[] = [userMsg('original task')];
  for (let i = 0; i < 4; i++) {
    msgs.push(toolTurn(`t${i}`));
    msgs.push(userMsg(`follow up ${i}`));
  }
  return msgs;
}

describe('planCompaction', () => {
  it('does nothing below the threshold', () => {
    const plan = planCompaction(longHistory(), 0.5 * 200_000, 200_000);
    expect(plan).toBeUndefined();
  });

  it('fires at or above the threshold', () => {
    const plan = planCompaction(longHistory(), COMPACT_THRESHOLD * 200_000, 200_000);
    expect(plan).toBeDefined();
  });

  it('never drops the first user message — that is the task', () => {
    const msgs = longHistory();
    const plan = planCompaction(msgs, 0.9 * 200_000, 200_000)!;
    expect(plan.keepHead).toEqual([msgs[0]]);
    expect(plan.drop).not.toContain(msgs[0]);
  });

  it('keeps a tail of recent turns for continuity', () => {
    const msgs = longHistory();
    const plan = planCompaction(msgs, 0.9 * 200_000, 200_000)!;
    expect(plan.keepTail.length).toBeGreaterThan(0);
    // The most recent message always survives.
    expect(plan.keepTail[plan.keepTail.length - 1]).toBe(msgs[msgs.length - 1]);
  });

  it('drops whole messages only — a tool_use is never separated from its result', () => {
    const msgs = longHistory();
    const plan = planCompaction(msgs, 0.9 * 200_000, 200_000)!;

    const all = [...plan.keepHead, ...plan.drop, ...plan.keepTail];
    expect(all).toHaveLength(msgs.length);
    // Every partition member is an original message object, never a slice of one.
    for (const m of all) expect(msgs).toContain(m);
  });

  it('refuses to compact when there is too little to gain', () => {
    // Three messages: head + tail leaves nothing worth dropping.
    const msgs = [userMsg('task'), toolTurn('t0'), userMsg('now')];
    expect(planCompaction(msgs, 0.95 * 200_000, 200_000)).toBeUndefined();
  });

  it('does not compact an empty or single-message history', () => {
    expect(planCompaction([], 999_999, 200_000)).toBeUndefined();
    expect(planCompaction([userMsg('hi')], 999_999, 200_000)).toBeUndefined();
  });
});

describe('buildCompactedHistory', () => {
  it('splices the summary between head and tail, in order', () => {
    const msgs = longHistory();
    const plan = planCompaction(msgs, 0.9 * 200_000, 200_000)!;
    const out = buildCompactedHistory(plan, 'GOAL: fix the bug');

    expect(out[0]).toBe(plan.keepHead[0]);
    expect(out[out.length - 1]).toBe(plan.keepTail[plan.keepTail.length - 1]);
    expect(out).toHaveLength(plan.keepHead.length + 1 + plan.keepTail.length);
  });

  it('marks the summary as prior context, attributed to the assistant', () => {
    const msgs = longHistory();
    const plan = planCompaction(msgs, 0.9 * 200_000, 200_000)!;
    const out = buildCompactedHistory(plan, 'GOAL: fix the bug');

    const summary = out[plan.keepHead.length];
    expect(summary.role).toBe('assistant');
    expect(String(summary.content)).toContain('GOAL: fix the bug');
    expect(String(summary.content)).toMatch(/compacted/i);
  });

  it('produces a history that still starts with a user message', () => {
    // Providers reject a conversation that opens on an assistant turn.
    const msgs = longHistory();
    const plan = planCompaction(msgs, 0.9 * 200_000, 200_000)!;
    const out = buildCompactedHistory(plan, 'summary');
    expect(out[0].role).toBe('user');
  });
});
