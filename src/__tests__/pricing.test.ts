import { describe, it, expect } from 'vitest';
import { costUsd, resolvePricing, contextWindowFor, contextTokens, isPricingKnown } from '../pricing';

describe('resolvePricing', () => {
  it('prefers the longest matching prefix', () => {
    // The old prefix scan returned whichever row came first, so glm-4.5-flash
    // was billed at glm-4.5 rates.
    expect(resolvePricing('glm-4.5-flash')!.prefix).toBe('glm-4.5-flash');
    expect(resolvePricing('glm-4.5-air')!.prefix).toBe('glm-4.5-air');
    expect(resolvePricing('glm-4.5')!.prefix).toBe('glm-4.5');
    expect(resolvePricing('gpt-4o-mini')!.prefix).toBe('gpt-4o-mini');
    expect(resolvePricing('gpt-4o')!.prefix).toBe('gpt-4o');
  });

  it('is case insensitive and tolerates surrounding whitespace', () => {
    expect(resolvePricing('  GLM-4.6  ')!.prefix).toBe('glm-4.6');
    expect(resolvePricing('Claude-Sonnet-5')!.prefix).toBe('claude-sonnet-5');
  });

  it('does not confuse sonnet-4 with sonnet-5', () => {
    expect(resolvePricing('claude-sonnet-4-20250514')!.prefix).toBe('claude-sonnet-4');
    expect(resolvePricing('claude-sonnet-5')!.prefix).toBe('claude-sonnet-5');
  });

  it('returns undefined for an unknown model', () => {
    expect(resolvePricing('some-future-model')).toBeUndefined();
    expect(isPricingKnown('some-future-model')).toBe(false);
  });
});

describe('costUsd', () => {
  it('prices input and output at their own rates', () => {
    // claude-sonnet-5: $2/Mtok in, $10/Mtok out.
    const cost = costUsd('claude-sonnet-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(12.0, 10);
  });

  it('prices cache reads far below fresh input', () => {
    // 1M cache-read tokens at $0.2 rather than $2.
    const cost = costUsd('claude-sonnet-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.2, 10);
  });

  it('prices cache writes slightly above fresh input', () => {
    const cost = costUsd('claude-sonnet-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(2.5, 10);
  });

  it('bills glm-4.5-flash at its own rate, not glm-4.5', () => {
    const flash = costUsd('glm-4.5-flash', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    const base = costUsd('glm-4.5', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(flash).toBe(0);
    expect(base).toBeCloseTo(2.8, 10);
  });

  it('falls back to the input rate when a provider has no cache pricing', () => {
    // glm-4.6 has no cache rates; cache reads bill as ordinary input.
    const cost = costUsd('glm-4.6', { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 });
    expect(cost).toBeCloseTo(0.43, 10);
  });

  it('returns undefined for an unknown model instead of silently charging zero', () => {
    expect(costUsd('some-future-model', { inputTokens: 1000, outputTokens: 1000 })).toBeUndefined();
  });

  it('treats missing cache fields as zero', () => {
    expect(costUsd('glm-4.6', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe('contextWindowFor', () => {
  it('is per-model, not a global constant', () => {
    expect(contextWindowFor('claude-sonnet-5')).toBe(200_000);
    expect(contextWindowFor('glm-4.5-air')).toBe(128_000);
    expect(contextWindowFor('deepseek-reasoner')).toBe(64_000);
  });

  it('falls back to a conservative default for unknown models', () => {
    expect(contextWindowFor('some-future-model')).toBe(128_000);
  });
});

describe('contextTokens', () => {
  it('counts every token class, since cached tokens still occupy context', () => {
    expect(
      contextTokens({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 }),
    ).toBe(100);
  });
});
