// Starts the API: migrations, extractor (live Claude or recorded replay), HTTP server.
import { resolve } from 'node:path';
import { createAnthropicExtractor, resolveApiKey, type Extractor } from '@tally/extractor';
import pg from 'pg';
import { buildApp } from './app.ts';
import { loadConfig, REPO_ROOT } from './config.ts';
import { migrate } from './db/migrate.ts';
import { createDemoPolicy, SAMPLES } from './demo.ts';
import { localFileStore } from './files.ts';
import { createReplayExtractor } from './replay.ts';
import { listSummaries, uploadDocument, type Deps } from './service.ts';

const config = loadConfig(process.env);
const pool = new pg.Pool({ connectionString: config.databaseUrl });
await migrate(pool);

/** Claude, if a key is available. Same rule as the eval: the repository's .env wins over the shell. */
async function liveExtractor(): Promise<Extractor | null> {
  const key = await resolveApiKey(resolve(REPO_ROOT, '.env'), process.env);
  return key ? createAnthropicExtractor({ model: config.model, apiKey: key.value }) : null;
}

const replay = await createReplayExtractor(config.replay);
const deps: Deps = {
  pool,
  extractor: replay,
  files: localFileStore(config.filesDir),
  reviewer: config.reviewer,
};

if (config.demo) {
  deps.demo = createDemoPolicy({
    replay,
    live: config.demo.accessCode ? await liveExtractor() : null,
    accessCode: config.demo.accessCode,
    liveDailyCap: config.demo.liveDailyCap,
    goldenDir: config.replay.goldenDir,
  });
} else if (config.extractor === 'live') {
  const live = await liveExtractor();
  if (!live) throw new Error('EXTRACTOR=live needs ANTHROPIC_API_KEY in .env');
  deps.extractor = live;
}

const app = await buildApp(deps, {
  logger: true,
  trustProxy: config.trustProxy,
  webDir: config.webDir ?? undefined,
});

// A visitor should never land on an empty queue.
if (deps.demo && (await listSummaries(deps)).length === 0) {
  for (const { id } of [...SAMPLES].reverse()) {
    const data = await deps.demo.sample(id);
    await uploadDocument(deps, { filename: `${id}.jpg`, mediaType: 'image/jpeg', data });
  }
  app.log.info(`demo: preloaded ${SAMPLES.length} sample documents`);
}

await app.listen({ host: config.host, port: config.port });
app.log.info(
  `extractor: ${deps.extractor.model}${deps.demo ? `, demo (live ${deps.demo.liveEnabled ? 'with access code' : 'off'})` : ''}`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => pool.end());
  });
}
