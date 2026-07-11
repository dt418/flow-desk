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
import { chatRouter } from './modules/chat/chat.routes';
import { chatMessageRouter } from './modules/chat/chat.message.routes';
import { prefsRouter } from './modules/notification-preferences/notification-preferences.routes';
import { searchRouter } from './modules/search/search.routes';
import { savedFilterRouter } from './modules/saved-filter/saved-filter.routes';
import { webhookRouter } from './modules/webhook/webhook.routes';
import { automationRouter } from './modules/automation/automation.routes';
import { sprintRouter } from './modules/sprint/sprint.routes';
import { templateRouter } from './modules/template/template.routes';
import { boardMgmtRouter } from './modules/board-mgmt/board-mgmt.routes';
import { apiKeyRouter, publicV1Router } from './modules/api-key/api-key.routes';
import { integrationsRouter } from './modules/integrations/integrations.routes';
import { metricsMiddleware } from './shared/middleware/metrics';
import { renderMetrics } from './shared/lib/metrics';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const writeRateLimit = rateLimit({ scope: 'writes', windowSec: 60, max: 60, keyBy: 'user' });

export function buildApp(): Hono {
  const app = new Hono();

  app.use('*', requestId());
  app.use('*', metricsMiddleware());
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '0');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (env.NODE_ENV === 'production') {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });
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

  // Prometheus scrape endpoint (P2-3)
  app.get('/metrics', async (c) => {
    const body = await renderMetrics();
    return c.text(body, 200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    });
  });

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
  app.route('/api/workspaces/:wid/channels', chatRouter);
  app.route('/api/workspaces/:wid/channels/:channelId/messages', chatMessageRouter);
  app.route('/api/notification-preferences', prefsRouter);
  app.route('/api/search', searchRouter);
  app.route('/api/workspaces/:wid/saved-filters', savedFilterRouter);
  app.route('/api/workspaces/:wid/webhooks', webhookRouter);
  app.route('/api/workspaces/:wid/rules', automationRouter);
  app.route('/api/workspaces/:wid/sprints', sprintRouter);
  app.route('/api/workspaces/:wid/templates', templateRouter);
  app.route('/api/workspaces/:wid/boards', boardMgmtRouter);
  app.route('/api/api-keys', apiKeyRouter);
  app.route('/api/v1', publicV1Router);
  app.route('/api/integrations', integrationsRouter);

  app.onError(errorHandler);
  app.notFound((c) => c.json({ message: 'Not Found' }, 404));

  return app;
}
