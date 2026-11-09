import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { toInvoice, type LlmOutput } from './llm-schema.ts';
import { LATEST_PROMPT_VERSION, PROMPTS, USER_PROMPT, type PromptVersion } from './prompt.ts';
import {
  FatalExtractionError,
  type DocumentImage,
  type ExtractionResult,
  type Extractor,
} from './types.ts';

export type Effort = 'low' | 'medium' | 'high';

export interface AnthropicExtractorOptions {
  /** Any current Claude model ID; Haiku for iteration, Sonnet/Opus for the final numbers. */
  model: string;
  effort?: Effort;
  promptVersion?: PromptVersion;
  /** Passed explicitly so the caller decides where the key comes from (never read implicitly). */
  apiKey?: string;
  /** Injected in tests. */
  client?: Pick<Anthropic, 'messages'>;
}

// Errors that will fail every document the same way: stop the run instead of scoring 60 failures.
const FATAL_STATUSES = new Set([401, 403, 404]);

export function createAnthropicExtractor({
  model,
  effort = 'low',
  promptVersion = LATEST_PROMPT_VERSION,
  apiKey,
  client = new Anthropic({ apiKey }),
}: AnthropicExtractorOptions): Extractor {
  return {
    model,
    promptVersion,
    async extract(image: DocumentImage): Promise<ExtractionResult> {
      const base = { model, promptVersion };
      const prompt = PROMPTS[promptVersion];
      const started = performance.now();
      let response;
      try {
        // No temperature: current Claude models reject sampling parameters. Run-to-run
        // variation is measured by repeating the eval, not assumed away.
        response = await client.messages.parse({
          model,
          max_tokens: 16000,
          system: prompt.system,
          output_config: { effort, format: zodOutputFormat(prompt.schema) },
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: image.mediaType,
                    data: image.data.toString('base64'),
                  },
                },
                { type: 'text', text: USER_PROMPT },
              ],
            },
          ],
        });
      } catch (error) {
        const status: unknown = error instanceof Anthropic.APIError ? error.status : undefined;
        if (typeof status === 'number' && FATAL_STATUSES.has(status)) {
          throw new FatalExtractionError(`api ${status}: ${(error as Error).message}`, {
            cause: error,
          });
        }
        return {
          ...base,
          raw: null,
          output: null,
          notices: [],
          invoice: null,
          error:
            error instanceof Anthropic.APIError
              ? `api ${error.status}: ${error.message}`
              : String(error),
          stopReason: null,
          usage: { inputTokens: 0, outputTokens: 0 },
          latencyMs: Math.round(performance.now() - started),
        };
      }

      const latencyMs = Math.round(performance.now() - started);
      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
      const common = {
        ...base,
        raw: response,
        stopReason: response.stop_reason,
        usage,
        latencyMs,
        notices: [] as string[],
      };

      if (response.stop_reason !== 'end_turn') {
        return {
          ...common,
          output: null,
          invoice: null,
          error: `stop_reason: ${response.stop_reason}`,
        };
      }
      const output: LlmOutput | null = response.parsed_output;
      if (!output) {
        return { ...common, output: null, invoice: null, error: 'unparseable output' };
      }
      // Notices survive a schema failure: a document that fails to parse can still be suspicious.
      const notices = output.notices ?? [];
      const conversion = toInvoice(output);
      return conversion.ok
        ? { ...common, output, notices, invoice: conversion.invoice, error: null }
        : { ...common, output, notices, invoice: null, error: conversion.error };
    },
  };
}
