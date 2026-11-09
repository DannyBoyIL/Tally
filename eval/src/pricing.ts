// USD per million tokens, first-party API list prices as of 2026-11-09. Thinking tokens are
// billed (and reported) as output tokens. Update when prices change; unknown models cost null.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};

export function costUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
