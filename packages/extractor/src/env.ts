import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

export interface ApiKey {
  value: string;
  source: '.env' | 'shell environment';
}

/**
 * The repository's .env wins over the shell. Node's --env-file never overrides a variable that is
 * already set, so a key exported in a shell profile would silently be used instead. The shell is
 * only a fallback, for CI where the key arrives as a secret environment variable.
 */
export async function resolveApiKey(
  envFile: string,
  env: Record<string, string | undefined>,
): Promise<ApiKey | null> {
  let contents = '';
  try {
    contents = await readFile(envFile, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const fromFile = parseEnv(contents).ANTHROPIC_API_KEY?.trim();
  if (fromFile) return { value: fromFile, source: '.env' };
  const fromShell = env.ANTHROPIC_API_KEY?.trim();
  if (fromShell) return { value: fromShell, source: 'shell environment' };
  return null;
}
