// Demo mode: what a public visitor may do. Golden-set images replay recorded answers for free;
// any other image needs live Claude, which needs the access code and stays under a daily cap.
// A public link must never be an open API bill.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Extractor } from '@tally/extractor';
import type { ReplayExtractor } from './replay.ts';

export const SAMPLES = [
  { id: 'doc-001', label: 'Clean invoice' },
  { id: 'doc-045', label: 'Receipt with a wrong total' },
  { id: 'doc-062', label: 'Fake "our bank details changed" notice' },
  { id: 'doc-057', label: "IBAN that differs from the vendor's" },
] as const;

export class DemoError extends Error {
  override name = 'DemoError';
  readonly status: 403 | 404 | 429;
  constructor(message: string, status: 403 | 404 | 429) {
    super(message);
    this.status = status;
  }
}

export interface DemoPolicy {
  /** Whether live extraction can be unlocked at all (a key and an access code are configured). */
  liveEnabled: boolean;
  /** The extractor for this upload; throws DemoError when the visitor may not use live Claude. */
  extractorFor(data: Buffer, accessCode: string | undefined): Extractor;
  /** A sample's image, by golden-set id. */
  sample(id: string): Promise<Buffer>;
}

// Hashing first makes the comparison constant-time whatever the lengths.
const sameSecret = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export function createDemoPolicy(options: {
  replay: ReplayExtractor;
  live: Extractor | null;
  accessCode: string | null;
  liveDailyCap: number;
  goldenDir: string;
  /** UTC day, for the cap; injectable for tests. */
  today?: () => string;
}): DemoPolicy {
  const today = options.today ?? (() => new Date().toISOString().slice(0, 10));
  const { live, accessCode } = options;
  // In memory: a restart (the daily reset restarts the app) starts a fresh count.
  let used = { day: today(), count: 0 };

  return {
    liveEnabled: live !== null && accessCode !== null,
    extractorFor(data, code) {
      if (options.replay.knows(data)) return options.replay;
      if (!live || !accessCode) {
        throw new DemoError(
          'This demo only reads the sample invoices; live extraction is turned off.',
          403,
        );
      }
      if (!code || !sameSecret(code, accessCode)) {
        throw new DemoError(
          'Your own images are read by Claude live, which needs an access code. Try the samples instead.',
          403,
        );
      }
      if (used.day !== today()) used = { day: today(), count: 0 };
      if (used.count >= options.liveDailyCap) {
        throw new DemoError(
          "Today's live extractions are used up. Try the samples, or come back tomorrow.",
          429,
        );
      }
      used.count++;
      return live;
    },
    async sample(id) {
      if (!SAMPLES.some((s) => s.id === id)) throw new DemoError('unknown sample', 404);
      return readFile(join(options.goldenDir, id, 'page.jpg'));
    },
  };
}
