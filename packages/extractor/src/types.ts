import type { Invoice } from '@tally/shared';
import type { LlmOutput } from './llm-schema.ts';

export interface DocumentImage {
  data: Buffer;
  mediaType: 'image/jpeg' | 'image/png';
}

/**
 * One extraction, kept whole: `raw` is the provider response as received and is never modified.
 * `invoice` is null whenever anything failed; `error` says what.
 */
export interface ExtractionResult {
  model: string;
  promptVersion: string;
  raw: unknown;
  /** The model's structured output before normalization. */
  output: LlmOutput | null;
  /** Text the model reported as addressed to the reader (prompt v2+); input to the validators. */
  notices: string[];
  invoice: Invoice | null;
  error: string | null;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface Extractor {
  model: string;
  promptVersion: string;
  extract(image: DocumentImage): Promise<ExtractionResult>;
}

/** A failure that would repeat on every document (bad key, unknown model): stop, don't score it. */
export class FatalExtractionError extends Error {
  override name = 'FatalExtractionError';
}
