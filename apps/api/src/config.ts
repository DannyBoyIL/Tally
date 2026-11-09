import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

export interface Config {
  databaseUrl: string;
  host: string;
  port: number;
  /** Where uploaded files are kept (local disk now, S3 in phase 6). */
  filesDir: string;
  /** No login in the MVP: every review event is recorded under this name. */
  reviewer: string;
  extractor:
    | { mode: 'live'; model: string }
    /** Recorded responses from an eval run, matched by image hash: free and deterministic. */
    | { mode: 'replay'; goldenDir: string; outputsDir: string };
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set (see .env.example)');
  const mode = env.EXTRACTOR ?? 'replay';
  if (mode !== 'live' && mode !== 'replay') {
    throw new Error(`EXTRACTOR must be live or replay, got ${mode}`);
  }
  return {
    databaseUrl,
    host: env.HOST ?? '127.0.0.1',
    // API_PORT, not PORT: tools commonly export PORT, and the web dev server would read it too.
    port: Number(env.API_PORT ?? 3000),
    filesDir: resolve(env.FILES_DIR ?? resolve(repoRoot, 'var/files')),
    reviewer: env.REVIEWER ?? 'demo-reviewer',
    extractor:
      mode === 'live'
        ? { mode, model: env.MODEL ?? 'claude-haiku-5-5' }
        : {
            mode,
            goldenDir: resolve(env.REPLAY_GOLDEN_DIR ?? resolve(repoRoot, 'data/golden')),
            outputsDir: resolve(
              env.REPLAY_OUTPUTS_DIR ??
                resolve(repoRoot, 'eval/baselines/claude-haiku-5-5/v2/outputs'),
            ),
          },
  };
}

export const REPO_ROOT = repoRoot;
