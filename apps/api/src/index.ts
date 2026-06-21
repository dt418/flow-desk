import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { env } from './shared/lib/env';
import { logger } from './shared/lib/logger';
import { errorHandler } from './shared/middleware/error-handler';
import { requestId } from './shared/middleware/request-id';
import { authRouter } from './modules/auth/auth.routes';
import { workspaceRouter } from './modules/workspace/workspace.routes';
import { taskRouter } from './modules/task/task.routes';
import { commentRouter } from './modules/comment/comment.routes';
import { notificationRouter } from './modules/notification/notification.routes';
import { attachmentRouter } from './modules/attachment/attachment.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { createSocketServer } from './shared/lib/socket';

const app = new Hono();

app.use('*', requestId());
app.use('*', honoLogger((str) => logger.debug(str.trim())));
app.use(
  '*',
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

app.route('/api/auth', authRouter);
app.route('/api/workspaces', workspaceRouter);
app.route('/api/tasks', taskRouter);
app.route('/api/comments', commentRouter);
app.route('/api/notifications', notificationRouter);
app.route('/api/attachments', attachmentRouter);
app.route('/api/ai', aiRouter);

app.onError(errorHandler);
app.notFound((c) => c.json({ message: 'Not Found' }, 404));

const port = Number(env.PORT);

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'FlowDesk API started');
});

createSocketServer(server);
