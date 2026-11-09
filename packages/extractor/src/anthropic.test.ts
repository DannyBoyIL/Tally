import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createAnthropicExtractor } from './anthropic.ts';
import type { LlmInvoice } from './llm-schema.ts';
import { FatalExtractionError } from './types.ts';

const parsed: LlmInvoice = {
  documentType: 'receipt',
  vendor: { name: 'Corner Cafe', taxId: null, iban: null },
  invoiceNumber: null,
  issueDate: '2026-04-02',
  dueDate: null,
  currency: 'USD',
  lineItems: [{ description: 'Latte', quantity: 2, unitPrice: 4.5, amount: 9 }],
  subtotal: 9,
  tax: 0.72,
  total: 9.72,
};

const image = { data: Buffer.from('fake-jpeg'), mediaType: 'image/jpeg' as const };

function fakeClient(parse: (...args: unknown[]) => unknown) {
  const fn = vi.fn(parse);
  return {
    client: { messages: { parse: fn } } as unknown as Pick<Anthropic, 'messages'>,
    parse: fn,
  };
}

const response = (overrides: Record<string, unknown> = {}) => ({
  stop_reason: 'end_turn',
  usage: { input_tokens: 2700, output_tokens: 300 },
  parsed_output: parsed,
  ...overrides,
});

function apiError(status: number): Error {
  return Anthropic.APIError.generate(status, { error: { message: 'nope' } }, 'nope', new Headers());
}

describe('createAnthropicExtractor', () => {
  it('sends the image as base64 with structured output and no sampling parameters', async () => {
    const { client, parse } = fakeClient(() => Promise.resolve(response()));
    await createAnthropicExtractor({ model: 'claude-haiku-5-5', client }).extract(image);

    const request = parse.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: 'ZmFrZS1qcGVn' },
            },
            { type: 'text' },
          ],
        },
      ],
    });
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('top_p');
  });

  it('returns the normalized invoice, usage and the raw response', async () => {
    const { client } = fakeClient(() => Promise.resolve(response()));
    const result = await createAnthropicExtractor({ model: 'm', client }).extract(image);
    expect(result.error).toBeNull();
    expect(result.invoice).toMatchObject({
      total: 972,
      lineItems: [{ unitPrice: 450, amount: 900 }],
    });
    expect(result.usage).toEqual({ inputTokens: 2700, outputTokens: 300 });
    expect(result.raw).toMatchObject({ stop_reason: 'end_turn' });
  });

  it.each(['max_tokens', 'refusal'])(
    'reports stop_reason %s as an extraction failure',
    async (stop) => {
      const { client } = fakeClient(() => Promise.resolve(response({ stop_reason: stop })));
      const result = await createAnthropicExtractor({ model: 'm', client }).extract(image);
      expect(result).toMatchObject({
        invoice: null,
        error: `stop_reason: ${stop}`,
        stopReason: stop,
      });
    },
  );

  it('reports output that did not parse', async () => {
    const { client } = fakeClient(() => Promise.resolve(response({ parsed_output: null })));
    const result = await createAnthropicExtractor({ model: 'm', client }).extract(image);
    expect(result).toMatchObject({ invoice: null, error: 'unparseable output' });
  });

  it('keeps the model output when the strict schema rejects it', async () => {
    const bad = { ...parsed, issueDate: 'April 2' };
    const { client } = fakeClient(() => Promise.resolve(response({ parsed_output: bad })));
    const result = await createAnthropicExtractor({ model: 'm', client }).extract(image);
    expect(result.output).toEqual(bad);
    expect(result.invoice).toBeNull();
    expect(result.error).toMatch(/^schema: issueDate/);
  });

  it('turns a transient API error into a failed result', async () => {
    const { client } = fakeClient(() => {
      throw apiError(529);
    });
    const result = await createAnthropicExtractor({ model: 'm', client }).extract(image);
    expect(result).toMatchObject({ invoice: null, raw: null });
    expect(result.error).toMatch(/^api 529/);
  });

  it.each([401, 403, 404])('rethrows %i, which would fail every document', async (status) => {
    const { client } = fakeClient(() => {
      throw apiError(status);
    });
    await expect(
      createAnthropicExtractor({ model: 'm', client }).extract(image),
    ).rejects.toBeInstanceOf(FatalExtractionError);
  });
});
