/**
 * Per-model rates and context windows.
 *
 * Costs are billed per token class, not per "input token". Prompt caching in
 * particular splits input into three classes with very different prices, so a
 * flat input rate over-reports once caching is on. Providers that do not report
 * a class simply leave it at zero.
 */

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from an existing cache entry. Much cheaper than fresh input. */
  cacheReadTokens?: number;
  /** Tokens written into the cache. Slightly dearer than fresh input. */
  cacheWriteTokens?: number;
}

export interface ModelPricing {
  /** Matched against the normalized model id; longest match wins. */
  prefix: string;
  /** USD per 1M tokens. */
  input: number;
  output: number;
  /** Defaults to `input` when the provider has no separate cache pricing. */
  cacheWrite?: number;
  cacheRead?: number;
  contextWindow: number;
}

const K = 1_000;

/**
 * Order is irrelevant — resolution sorts by prefix length so `glm-4.5-flash`
 * can never be mispriced by the shorter `glm-4.5` entry.
 */
const MODELS: ModelPricing[] = [
  // Anthropic: cache write 1.25x input, cache read 0.1x input.
  { prefix: 'claude-opus-4-8', input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5, contextWindow: 200 * K },
  { prefix: 'claude-sonnet-5', input: 2.0, output: 10.0, cacheWrite: 2.5, cacheRead: 0.2, contextWindow: 200 * K },
  { prefix: 'claude-sonnet-4', input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.3, contextWindow: 200 * K },
  { prefix: 'claude-haiku-4-5', input: 1.0, output: 5.0, cacheWrite: 1.25, cacheRead: 0.1, contextWindow: 200 * K },

  // Z.AI — GLM 5.x rates from docs.z.ai (July 2026); cached input $0.26/$0.24/$0.2.
  // 1M window sourced for 5.2/5.1; glm-5 and glm-5-turbo windows unverified,
  // kept at a conservative 200K so the context meter over-warns, not under.
  { prefix: 'glm-5.2', input: 1.4, output: 4.4, cacheRead: 0.26, contextWindow: 1_000 * K },
  { prefix: 'glm-5.1', input: 1.4, output: 4.4, cacheRead: 0.26, contextWindow: 1_000 * K },
  { prefix: 'glm-5-turbo', input: 1.2, output: 4.0, cacheRead: 0.24, contextWindow: 200 * K },
  { prefix: 'glm-5', input: 1.0, output: 3.2, cacheRead: 0.2, contextWindow: 200 * K },
  { prefix: 'glm-4.7', input: 0.4, output: 1.75, contextWindow: 200 * K },
  { prefix: 'glm-4.6', input: 0.43, output: 1.74, contextWindow: 200 * K },
  { prefix: 'glm-4.5-flash', input: 0.0, output: 0.0, contextWindow: 128 * K },
  { prefix: 'glm-4.5-air', input: 0.2, output: 1.1, contextWindow: 128 * K },
  { prefix: 'glm-4.5', input: 0.6, output: 2.2, contextWindow: 128 * K },

  // DeepSeek: cache hits are 0.1x input.
  { prefix: 'deepseek-v4-pro', input: 0.435, output: 0.87, cacheRead: 0.0435, contextWindow: 128 * K },
  { prefix: 'deepseek-v4-flash', input: 0.14, output: 0.28, cacheRead: 0.014, contextWindow: 128 * K },
  { prefix: 'deepseek-reasoner', input: 0.55, output: 2.19, cacheRead: 0.14, contextWindow: 64 * K },

  // OpenAI: cached input is 0.5x.
  { prefix: 'gpt-4o-mini', input: 0.15, output: 0.6, cacheRead: 0.075, contextWindow: 128 * K },
  { prefix: 'gpt-4o', input: 2.5, output: 10.0, cacheRead: 1.25, contextWindow: 128 * K },
  { prefix: 'gpt-4-turbo', input: 10.0, output: 30.0, contextWindow: 128 * K },
  { prefix: 'o3-mini', input: 1.1, output: 4.4, cacheRead: 0.55, contextWindow: 200 * K },

  // Together
  { prefix: 'meta-llama/llama-4-maverick', input: 0.27, output: 0.85, contextWindow: 1_000 * K },
  { prefix: 'meta-llama/llama-3.3-70b', input: 0.88, output: 0.88, contextWindow: 128 * K },
  { prefix: 'deepseek-ai/deepseek-v3', input: 1.25, output: 1.25, contextWindow: 128 * K },
  { prefix: 'qwen/qwen2.5-72b', input: 1.2, output: 1.2, contextWindow: 32 * K },
];

const DEFAULT_CONTEXT_WINDOW = 128 * K;

/** Providers disagree on case and on vendor prefixes like `anthropic/`. */
function normalize(model: string): string {
  return model.trim().toLowerCase();
}

/** The pricing row for a model, or undefined when the model is unknown. */
export function resolvePricing(model: string): ModelPricing | undefined {
  const id = normalize(model);
  let best: ModelPricing | undefined;
  for (const row of MODELS) {
    if (!id.startsWith(row.prefix)) continue;
    if (!best || row.prefix.length > best.prefix.length) best = row;
  }
  return best;
}

/**
 * Cost of a single request in USD, or undefined when the model's rates are
 * unknown — callers must not silently treat that as zero.
 */
export function costUsd(model: string, usage: TurnUsage): number | undefined {
  const p = resolvePricing(model);
  if (!p) return undefined;

  const cacheWriteRate = p.cacheWrite ?? p.input;
  const cacheReadRate = p.cacheRead ?? p.input;

  const total =
    usage.inputTokens * p.input +
    usage.outputTokens * p.output +
    (usage.cacheWriteTokens ?? 0) * cacheWriteRate +
    (usage.cacheReadTokens ?? 0) * cacheReadRate;

  return total / 1_000_000;
}

/** Every token class occupies context, cached or not. */
export function contextTokens(usage: TurnUsage): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWriteTokens ?? 0)
  );
}

export function contextWindowFor(model: string): number {
  return resolvePricing(model)?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

/** True when we can price the model — lets the UI show "—" instead of a wrong number. */
export function isPricingKnown(model: string): boolean {
  return resolvePricing(model) !== undefined;
}
