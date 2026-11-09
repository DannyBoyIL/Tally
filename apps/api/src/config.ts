import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

export interface Config {
  databaseUrl: string;
  host: string;
  port: number;
  /** Where uploaded files are kept, on local disk (a Docker volume in production). */
  filesDir: string;
  /** No login in the MVP: every review event is recorded under this name. */
  reviewer: string;
  /** live: every upload goes to Claude. replay: recorded answers for golden-set images only. */
  extractor: 'live' | 'replay';
  model: string;
  /** Recorded responses from an eval run, matched by image hash: free and deterministic. */
  replay: { goldenDir: string; outputsDir: string };
  /**
   * Public demo: samples preloaded, golden images replayed, any other image read live only with
   * the access code and under a daily cap. Null when not a demo.
   */
  demo: { accessCode: string | null; liveDailyCap: number } | null;
  /** The built web app to serve at /, or null when Vite serves it (development). */
  webDir: string | null;
  trustProxy: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set (see .env.example)');
  const extractor = env.EXTRACTOR ?? 'replay';
  if (extractor !== 'live' && extractor !== 'replay') {
    throw new Error(`EXTRACTOR must be live or replay, got ${extractor}`);
  }
  return {
    databaseUrl,
    host: env.HOST ?? '127.0.0.1',
    // API_PORT, not PORT: tools commonly export PORT, and the web dev server would read it too.
    port: Number(env.API_PORT ?? 3000),
    filesDir: resolve(env.FILES_DIR ?? resolve(repoRoot, 'var/files')),
    reviewer: env.REVIEWER ?? 'demo-reviewer',
    extractor,
    model: env.MODEL ?? 'claude-haiku-5-5',
    replay: {
      goldenDir: resolve(env.REPLAY_GOLDEN_DIR ?? resolve(repoRoot, 'data/golden')),
      outputsDir: resolve(
        env.REPLAY_OUTPUTS_DIR ?? resolve(repoRoot, 'eval/baselines/claude-haiku-5-5/v2/outputs'),
      ),
    },
    demo:
      env.DEMO === 'true'
        ? {
            accessCode: env.DEMO_ACCESS_CODE || null,
            liveDailyCap: Number(env.DEMO_LIVE_DAILY_CAP ?? 20),
          }
        : null,
    webDir: env.WEB_DIR ? resolve(env.WEB_DIR) : null,
    trustProxy: env.TRUST_PROXY === 'true',
  };
}

export const REPO_ROOT = repoRoot;
