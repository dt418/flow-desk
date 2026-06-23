import { rateLimit } from '../middleware/rate-limit';

export const RATE_LIMITS = {
  LABEL_LIST: { windowSec: 60, max: 120 },
  LABEL_WRITE: { windowSec: 60, max: 30 },
  LABEL_ASSIGN: { windowSec: 60, max: 60 },

  WORKSPACE_LIST: { windowSec: 60, max: 60 },
  WORKSPACE_CREATE: { windowSec: 86400, max: 10 },
  WORKSPACE_UPDATE: { windowSec: 60, max: 30 },
  WORKSPACE_DELETE: { windowSec: 3600, max: 5 },
  WORKSPACE_INVITE: { windowSec: 60, max: 5 },
} as const;

export function labelWriteLimit(scope: string) {
  return rateLimit({ ...RATE_LIMITS.LABEL_WRITE, keyBy: 'user', scope });
}
export function labelAssignLimit(scope: string) {
  return rateLimit({ ...RATE_LIMITS.LABEL_ASSIGN, keyBy: 'user', scope });
}
export function workspaceCreateLimit() {
  return rateLimit({ ...RATE_LIMITS.WORKSPACE_CREATE, keyBy: 'user', scope: 'workspace:create' });
}
