import { describe, it, expect, vi } from 'vitest';
import { WebConsent, ConsentDecision } from '../../tools/web-consent';

function consent(
  decisions: ConsentDecision[],
  policy = { allowed: [] as string[], blocked: [] as string[] },
) {
  const prompt = vi.fn(async () => decisions.shift() ?? 'deny');
  return { c: new WebConsent(policy, prompt), prompt };
}

describe('WebConsent', () => {
  it('prompts on first contact with a domain', async () => {
    const { c, prompt } = consent(['once']);
    expect(await c.check('https://example.com/a')).toBeUndefined();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('"once" does not grant the domain — the next call prompts again', async () => {
    const { c, prompt } = consent(['once', 'once']);
    await c.check('https://example.com/a');
    await c.check('https://example.com/b');
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('"domain" remembers for the session, across different paths', async () => {
    const { c, prompt } = consent(['domain']);
    expect(await c.check('https://example.com/a')).toBeUndefined();
    expect(await c.check('https://example.com/b')).toBeUndefined();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('a grant for one host does not cover another', async () => {
    const { c, prompt } = consent(['domain', 'deny']);
    expect(await c.check('https://good.com/a')).toBeUndefined();
    expect(await c.check('https://evil.com/a')).toBeTruthy();
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('denial returns guidance telling the model not to retry', async () => {
    const { c } = consent(['deny']);
    const err = await c.check('https://evil.com/a');
    expect(err).toMatch(/denied/i);
    expect(err).toMatch(/do not retry/i);
  });

  it('allowlisted domains never prompt', async () => {
    const { c, prompt } = consent([], { allowed: ['*.anthropic.com'], blocked: [] });
    expect(await c.check('https://docs.anthropic.com/x')).toBeUndefined();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('blocklist wins over allowlist and over session grants', async () => {
    const { c, prompt } = consent(['domain'], { allowed: ['evil.com'], blocked: ['evil.com'] });
    expect(await c.check('https://evil.com/a')).toMatch(/deny list/i);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('reset() clears session grants', async () => {
    const { c, prompt } = consent(['domain', 'domain']);
    await c.check('https://example.com/a');
    c.reset();
    await c.check('https://example.com/a');
    expect(prompt).toHaveBeenCalledTimes(2);
  });
});
