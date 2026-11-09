// HTTP only: parse and check the request, call the service, map errors to status codes.
import multipart from '@fastify/multipart';
import { FatalExtractionError } from '@tally/extractor';
import { EventInput } from '@tally/shared';
import Fastify, { type FastifyInstance } from 'fastify';
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

export async function buildApp(
  deps: Deps,
  options: { logger?: boolean } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ReviewError)
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

  app.post('/api/documents', async (request, reply) => {
    const file = await request.file();
    if (!file)
      return reply.status(400).send({ error: 'send one file in a multipart "file" field' });
    if (!(file.mimetype in MEDIA_TYPES)) {
      return reply.status(415).send({ error: 'only JPEG and PNG images are supported' });
    }
    const data = await file.toBuffer();
    const view = await uploadDocument(deps, {
      filename: file.filename.slice(0, 200) || 'upload',
      mediaType: file.mimetype as MediaType,
      data,
    });
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

  app.post<WithId>('/api/documents/:id/events', async (request, reply) => {
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
