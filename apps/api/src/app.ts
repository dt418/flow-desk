import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { env } from './shared/lib/prisma';
import { logger } from './shared/lib/logger';
import { errorHandler } from './shared/middleware/error-handler';
import { requestId } from './shared/middleware/request-id';
import { rateLimit } from './shared/middleware/rate-limit';
import { authRouter } from './modules/auth/auth.routes';
import { workspaceRouter } from './modules/workspace/workspace.routes';
import { taskRouter } from './modules/task/task.routes';
import { commentRouter } from './modules/comment/comment.routes';
import { notificationRouter } from './modules/notification/notification.routes';
import { attachmentRouter } from './modules/attachment/attachment.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { labelRouter } from './modules/label';
import { taskLabelRouter } from './modules/task/task-label.routes';
import { boardRouter } from './modules/board/board.routes';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const writeRateLimit = rateLimit({ scope: 'writes', windowSec: 60, max: 60, keyBy: 'user' });

export function buildApp(): Hono {
  const app = new Hono();

  app.use('*', requestId());
  app.use(
    '*',
    honoLogger((str) => logger.debug(str.trim())),
  );
  app.use(
    '*',
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use('/api/*', async (c, next) => {
    if (!WRITE_METHODS.has(c.req.method)) return next();
    return writeRateLimit(c, next);
  });

  app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

  app.route('/api/auth', authRouter);
  app.route('/api/workspaces', workspaceRouter);
  app.route('/api/workspaces/:workspaceId/board', boardRouter);
  app.route('/api/tasks', taskRouter);
  app.route('/api/comments', commentRouter);
  app.route('/api/notifications', notificationRouter);
  app.route('/api/attachments', attachmentRouter);
  app.route('/api/ai', aiRouter);
  app.route('/api/workspaces/:wid/labels', labelRouter);
  app.route('/api/workspaces/:wid/tasks/:tid/labels', taskLabelRouter);

  app.onError(errorHandler);
  app.notFound((c) => c.json({ message: 'Not Found' }, 404));

  return app;
}
