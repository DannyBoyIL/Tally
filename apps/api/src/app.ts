// HTTP only: parse and check the request, call the service, map errors to status codes.
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { FatalExtractionError } from '@tally/extractor';
import { EventInput } from '@tally/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { DemoError, SAMPLES } from './demo.ts';
import { ReviewError } from './review.ts';
import {
  addEvent,
  getView,
  listSummaries,
  MEDIA_TYPES,
  uploadDocument,
  type Deps,
  type MediaType,
} from './service.ts';
import { getDocument } from './store.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type WithId = { Params: { id: string } };

export interface AppOptions {
  logger?: boolean;
  /** Behind a reverse proxy (Caddy): take the client IP from X-Forwarded-For, for rate limits. */
  trustProxy?: boolean;
  /** The built web app (apps/web/dist): served at / so one container serves UI and API. */
  webDir?: string;
}

export async function buildApp(deps: Deps, options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, trustProxy: options.trustProxy ?? false });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  // Only in demo mode, and only routes that opt in (the ones that write). Without the plugin
  // registered, the routes' rateLimit config is ignored.
  if (deps.demo) await app.register(rateLimit, { global: false });
  const writeLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

  if (options.webDir) {
    await app.register(fastifyStatic, { root: options.webDir });
    // The UI routes on the client (/documents/:id): any other GET outside /api gets the app.
    app.setNotFoundHandler((request, reply) =>
      request.method === 'GET' && !request.url.startsWith('/api/')
        ? reply.sendFile('index.html')
        : reply.status(404).send({ error: 'not found' }),
    );
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ReviewError || error instanceof DemoError)
      return reply.status(error.status).send({ error: error.message });
    if (error instanceof FatalExtractionError) {
      request.log.error(error);
      return reply
        .status(503)
        .send({ error: 'extraction is unavailable; check the server configuration' });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: (error as Error).message });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'internal error' });
  });

  app.get('/api/health', () => ({ ok: true, extractor: deps.extractor.model }));

  app.get('/api/documents', () => listSummaries(deps));

  app.get('/api/demo', () =>
    deps.demo
      ? { demo: true, liveEnabled: deps.demo.liveEnabled, samples: SAMPLES }
      : { demo: false },
  );

  app.post<WithId>('/api/demo/samples/:id', { config: writeLimit }, async (request, reply) => {
    if (!deps.demo) return reply.status(404).send({ error: 'not a demo' });
    const data = await deps.demo.sample(request.params.id);
    const view = await uploadDocument(
      deps,
      {
        filename: `${request.params.id}.jpg`,
        mediaType: 'image/jpeg',
        data,
      },
      deps.demo.extractorFor(data, undefined),
    );
    return reply.status(201).send(view);
  });

  app.post('/api/documents', { config: writeLimit }, async (request, reply) => {
    const file = await request.file();
    if (!file)
      return reply.status(400).send({ error: 'send one file in a multipart "file" field' });
    if (!(file.mimetype in MEDIA_TYPES)) {
      return reply.status(415).send({ error: 'only JPEG and PNG images are supported' });
    }
    const data = await file.toBuffer();
    const code = request.headers['x-access-code'];
    const extractor = deps.demo
      ? deps.demo.extractorFor(data, typeof code === 'string' ? code : undefined)
      : deps.extractor;
    const view = await uploadDocument(
      deps,
      {
        filename: file.filename.slice(0, 200) || 'upload',
        mediaType: file.mimetype as MediaType,
        data,
      },
      extractor,
    );
    return reply.status(201).send(view);
  });

  app.get<WithId>('/api/documents/:id', async (request, reply) => {
    const view = UUID.test(request.params.id) ? await getView(deps, request.params.id) : null;
    return view ?? reply.status(404).send({ error: 'document not found' });
  });

  app.get<WithId>('/api/documents/:id/image', async (request, reply) => {
    const doc = UUID.test(request.params.id)
      ? await getDocument(deps.pool, request.params.id)
      : null;
    if (!doc) return reply.status(404).send({ error: 'document not found' });
    return reply.type(doc.mediaType).send(await deps.files.get(doc.storageKey));
  });

  app.post<WithId>('/api/documents/:id/events', { config: writeLimit }, async (request, reply) => {
    const input = EventInput.safeParse(request.body);
    if (!input.success) {
      const issue = input.error.issues[0];
      return reply
        .status(400)
        .send({ error: `${issue?.path.join('.') || 'body'}: ${issue?.message}` });
    }
    const view = UUID.test(request.params.id)
      ? await addEvent(deps, request.params.id, input.data)
      : null;
    return view ?? reply.status(404).send({ error: 'document not found' });
  });

  return app;
}
