import { prisma } from '../../shared/lib/prisma';

export interface SearchInput {
  q: string;
  userId: string;
  workspaceId?: string;
  limit: number;
}

export interface SearchResultRow {
  type: 'task' | 'comment' | 'attachment';
  id: string;
  workspaceId: string;
  taskId: string;
  title: string;
  rank: number | { toString(): string };
}

// Raw SQL bypasses the softDeleteExtension — manually filter deletedAt IS NULL
// and join WorkspaceMember for membership. workspaceId bound as nullable param:
// ($ws::text IS NULL OR ...) keeps it fully parameterized (no rawUnsafe, no
// injection surface). ponytail: offset pagination deferred; palettes show top-N.
export async function searchTasks(
  p: typeof prisma,
  input: SearchInput,
): Promise<SearchResultRow[]> {
  const ws = input.workspaceId ?? null;
  return p.$queryRaw<SearchResultRow[]>`
    SELECT
      'task' AS type,
      t.id AS id,
      t."workspaceId" AS "workspaceId",
      t.id AS "taskId",
      t.title AS title,
      ts_rank(t."searchVector", q) AS rank
    FROM "Task" t, plainto_tsquery('english', ${input.q}) q
    WHERE t."searchVector" @@ q
      AND t."deletedAt" IS NULL
      AND (${ws}::text IS NULL OR t."workspaceId" = ${ws})
      AND EXISTS (
        SELECT 1 FROM "WorkspaceMember" m
        WHERE m."workspaceId" = t."workspaceId" AND m."userId" = ${input.userId}
      )
    ORDER BY rank DESC, t."createdAt" DESC
    LIMIT ${input.limit}
  `;
}

export async function searchComments(
  p: typeof prisma,
  input: SearchInput,
): Promise<SearchResultRow[]> {
  const ws = input.workspaceId ?? null;
  return p.$queryRaw<SearchResultRow[]>`
    SELECT
      'comment' AS type,
      c.id AS id,
      t."workspaceId" AS "workspaceId",
      t.id AS "taskId",
      LEFT(c.content, 200) AS title,
      ts_rank(c."searchVector", q) AS rank
    FROM "Comment" c, plainto_tsquery('english', ${input.q}) q
    JOIN "Task" t ON t.id = c."taskId"
    WHERE c."searchVector" @@ q
      AND c."deletedAt" IS NULL
      AND t."deletedAt" IS NULL
      AND (${ws}::text IS NULL OR t."workspaceId" = ${ws})
      AND EXISTS (
        SELECT 1 FROM "WorkspaceMember" m
        WHERE m."workspaceId" = t."workspaceId" AND m."userId" = ${input.userId}
      )
    ORDER BY rank DESC, c."createdAt" DESC
    LIMIT ${input.limit}
  `;
}

export async function searchAttachments(
  p: typeof prisma,
  input: SearchInput,
): Promise<SearchResultRow[]> {
  const ws = input.workspaceId ?? null;
  return p.$queryRaw<SearchResultRow[]>`
    SELECT
      'attachment' AS type,
      a.id AS id,
      t."workspaceId" AS "workspaceId",
      t.id AS "taskId",
      a.filename AS title,
      ts_rank(a."searchVector", q) AS rank
    FROM "Attachment" a, plainto_tsquery('english', ${input.q}) q
    JOIN "Task" t ON t.id = a."taskId"
    WHERE a."searchVector" @@ q
      AND t."deletedAt" IS NULL
      AND (${ws}::text IS NULL OR t."workspaceId" = ${ws})
      AND EXISTS (
        SELECT 1 FROM "WorkspaceMember" m
        WHERE m."workspaceId" = t."workspaceId" AND m."userId" = ${input.userId}
      )
    ORDER BY rank DESC, a."createdAt" DESC
    LIMIT ${input.limit}
  `;
}
