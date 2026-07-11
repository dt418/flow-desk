-- PERF-06: composite indexes for Task list path that orders by position
-- where: { workspaceId, deletedAt: null } orderBy: [{ position: 'asc' }, { id: 'asc' }]
-- and where: { columnId } orderBy: { position: 'asc' }
-- CONCURRENTLY is required for production-scale tables; safe on small dev DB.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_workspaceId_deletedAt_position_idx"
  ON "Task"("workspaceId", "deletedAt", "position");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_columnId_position_idx"
  ON "Task"("columnId", "position");
