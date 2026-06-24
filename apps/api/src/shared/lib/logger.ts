import pino from 'pino';
import { env } from './prisma';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'flow-desk-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
});
