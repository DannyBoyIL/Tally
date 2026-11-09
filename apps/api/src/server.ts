// Starts the API: migrations, extractor (live Claude or recorded replay), HTTP server.
import { resolve } from 'node:path';
import { createAnthropicExtractor, resolveApiKey, type Extractor } from '@tally/extractor';
import pg from 'pg';
import { buildApp } from './app.ts';
import { loadConfig, REPO_ROOT } from './config.ts';
import { migrate } from './db/migrate.ts';
import { localFileStore } from './files.ts';
import { createReplayExtractor } from './replay.ts';

const config = loadConfig(process.env);
const pool = new pg.Pool({ connectionString: config.databaseUrl });
await migrate(pool);

let extractor: Extractor;
if (config.extractor.mode === 'live') {
  // Same rule as the eval: the repository's .env wins over a key exported in the shell.
  const key = await resolveApiKey(resolve(REPO_ROOT, '.env'), process.env);
  if (!key) throw new Error('EXTRACTOR=live needs ANTHROPIC_API_KEY in .env');
  extractor = createAnthropicExtractor({ model: config.extractor.model, apiKey: key.value });
} else {
  extractor = await createReplayExtractor(config.extractor);
}

const app = await buildApp(
  { pool, extractor, files: localFileStore(config.filesDir), reviewer: config.reviewer },
  { logger: true },
);
await app.listen({ host: config.host, port: config.port });
app.log.info(`extractor: ${extractor.model}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => pool.end());
  });
}
