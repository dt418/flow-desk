import 'dotenv/config';
import type { Server as HttpServer } from 'node:http';
import { serve } from '@hono/node-server';
import { env } from './shared/lib/env';
import { logger } from './shared/lib/logger';
import { buildApp } from './app';
import { createSocketServer } from './shared/lib/socket';
import { setIo } from './shared/lib/socket-events';

const app = buildApp();

const port = Number(env.PORT);

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'FlowDesk API started');
});

const io = createSocketServer(server as HttpServer);
setIo(io);
