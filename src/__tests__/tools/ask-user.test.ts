import { describe, it, expect, vi, beforeEach } from 'vitest';
import { askUserTool, parseQuestion, AskUserBridge, setAskUserBridge } from '../../tools/ask-user';

/**
 * ask_user suspends the agent loop until the webview posts an answer back.
 * The dangerous states are: an answer that never arrives (abort), and a stale
 * answer for a question that was already superseded.
 */

function bridge(): AskUserBridge & { asked: any[] } {
  const asked: any[] = [];
  const b: any = {
    asked,
    ask(question: any) {
      asked.push(question);
      return new Promise((resolve) => {
        b.resolveLast = resolve;
      });
    },
  };
  return b;
}

describe('parseQuestion', () => {
  it('accepts a well-formed question', () => {
    const q = parseQuestion({
      question: 'Which database?',
      header: 'Database',
      options: [
        { label: 'Postgres', description: 'Relational' },
        { label: 'SQLite', description: 'Embedded' },
      ],
    });
    expect(q?.question).toBe('Which database?');
    expect(q?.options).toHaveLength(2);
  });

  it('rejects a missing question', () => {
    expect(parseQuestion({ options: [{ label: 'a', description: 'b' }] })).toBeUndefined();
  });

  it('rejects fewer than two options', () => {
    expect(parseQuestion({ question: 'q', options: [{ label: 'a', description: 'b' }] })).toBeUndefined();
  });

  it('rejects more than four options', () => {
    const options = Array.from({ length: 5 }, (_, i) => ({ label: `o${i}`, description: 'd' }));
    expect(parseQuestion({ question: 'q', options })).toBeUndefined();
  });

  it('rejects options with an empty label', () => {
    expect(parseQuestion({
      question: 'q',
      options: [{ label: '  ', description: 'd' }, { label: 'b', description: 'd' }],
    })).toBeUndefined();
  });

  it('defaults multiSelect to false and header to empty', () => {
    const q = parseQuestion({
      question: 'q',
      options: [{ label: 'a', description: 'd' }, { label: 'b', description: 'd' }],
    });
    expect(q?.multiSelect).toBe(false);
    expect(q?.header).toBe('');
  });
});

describe('ask_user tool', () => {
  beforeEach(() => setAskUserBridge(undefined as any));

  const valid = {
    question: 'Which database?',
    header: 'Database',
    options: [
      { label: 'Postgres', description: 'Relational' },
      { label: 'SQLite', description: 'Embedded' },
    ],
  };

  it('errors when the bridge is not initialized', async () => {
    const r = await askUserTool.execute(valid);
    expect(r.error).toBeTruthy();
  });

  it('errors on a malformed question instead of hanging', async () => {
    setAskUserBridge(bridge());
    const r = await askUserTool.execute({ question: 'q', options: [] });
    expect(r.error).toMatch(/2 and 4 options/i);
  });

  it('returns the user selection as the tool result', async () => {
    const b = bridge();
    setAskUserBridge(b);

    const pending = askUserTool.execute(valid);
    expect(b.asked).toHaveLength(1);

    (b as any).resolveLast({ answers: ['SQLite'] });
    const r = await pending;

    expect(r.error).toBeUndefined();
    expect(r.content).toContain('SQLite');
  });

  it('carries a free-text "Other" answer through verbatim', async () => {
    const b = bridge();
    setAskUserBridge(b);

    const pending = askUserTool.execute(valid);
    (b as any).resolveLast({ answers: ['DuckDB, actually'], other: true });
    const r = await pending;

    expect(r.content).toContain('DuckDB, actually');
  });

  it('joins multi-select answers', async () => {
    const b = bridge();
    setAskUserBridge(b);

    const pending = askUserTool.execute({ ...valid, multiSelect: true });
    (b as any).resolveLast({ answers: ['Postgres', 'SQLite'] });
    const r = await pending;

    expect(r.content).toContain('Postgres');
    expect(r.content).toContain('SQLite');
  });

  it('reports cancellation as an error the model can act on', async () => {
    const b = bridge();
    setAskUserBridge(b);

    const pending = askUserTool.execute(valid);
    (b as any).resolveLast({ cancelled: true });
    const r = await pending;

    // The model must be told not to re-ask, or it loops on the same question.
    expect(r.error).toMatch(/dismissed/i);
    expect(r.error).toMatch(/do not ask again/i);
  });

  it('passes the option list through to the UI, including descriptions', async () => {
    const b = bridge();
    setAskUserBridge(b);
    void askUserTool.execute(valid);

    expect(b.asked[0].options[0]).toEqual({ label: 'Postgres', description: 'Relational' });
    expect(b.asked[0].header).toBe('Database');
  });
});
