import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveApiKey } from './env.ts';

async function envFile(contents: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'tally-env-')), '.env');
  await writeFile(path, contents);
  return path;
}

describe('resolveApiKey', () => {
  it('prefers .env over a key exported in the shell', async () => {
    const file = await envFile('POSTGRES_USER=tally\nANTHROPIC_API_KEY=from-file\n');
    expect(await resolveApiKey(file, { ANTHROPIC_API_KEY: 'from-shell' })).toEqual({
      value: 'from-file',
      source: '.env',
    });
  });

  it('falls back to the shell when .env has no key or an empty one', async () => {
    const file = await envFile('ANTHROPIC_API_KEY=\n');
    expect(await resolveApiKey(file, { ANTHROPIC_API_KEY: 'from-shell' })).toEqual({
      value: 'from-shell',
      source: 'shell environment',
    });
  });

  it('falls back to the shell when there is no .env', async () => {
    const missing = join(tmpdir(), 'tally-no-such-dir', '.env');
    expect(await resolveApiKey(missing, { ANTHROPIC_API_KEY: 'k' })).toMatchObject({
      source: 'shell environment',
    });
  });

  it('returns null when neither has a key', async () => {
    expect(await resolveApiKey(await envFile(''), {})).toBeNull();
  });
});
