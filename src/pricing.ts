/** USD per 1M tokens [input, output]. Prefix-matched against the model id. */
const PRICING: Array<[string, number, number]> = [
  ['claude-sonnet-5', 2.0, 10.0],
  ['claude-opus-4-8', 5.0, 25.0],
  ['claude-haiku-4-5', 1.0, 5.0],
  ['claude-sonnet-4', 3.0, 15.0],
  ['glm-4.7', 0.4, 1.75],
  ['glm-4.6', 0.43, 1.74],
  ['glm-4.5-air', 0.2, 1.1],
  ['glm-4.5', 0.6, 2.2],
  ['deepseek-v4-pro', 0.435, 0.87],
  ['deepseek-v4-flash', 0.14, 0.28],
  ['gpt-4o-mini', 0.15, 0.6],
  ['gpt-4o', 2.5, 10.0],
];

/** Cost in USD, or undefined when the model's rates are unknown. */
export function costUsd(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const row = PRICING.find(([prefix]) => model.startsWith(prefix));
  if (!row) return undefined;
  return (inputTokens * row[1] + outputTokens * row[2]) / 1_000_000;
}

export const CONTEXT_WINDOW = 1_000_000;
