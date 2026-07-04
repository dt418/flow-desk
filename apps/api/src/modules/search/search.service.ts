import { prisma } from '../../shared/lib/prisma';
import * as repo from './search.repository';
import type { SearchQuery, SearchResult } from '@flow-desk/shared/search';

export async function search(
  userId: string,
  query: SearchQuery,
): Promise<{ data: SearchResult[] }> {
  const input = { q: query.q, userId, workspaceId: query.workspaceId, limit: query.limit };
  const [tasks, comments, attachments] = await Promise.all([
    repo.searchTasks(prisma, input),
    repo.searchComments(prisma, input),
    repo.searchAttachments(prisma, input),
  ]);
  const merged = [...tasks, ...comments, ...attachments].sort((a, b) => {
    if (b.rank !== a.rank) return Number(b.rank) - Number(a.rank);
    return a.title.localeCompare(b.title);
  });
  const data = merged.slice(0, query.limit).map((row) => ({
    type: row.type,
    id: row.id,
    workspaceId: row.workspaceId,
    taskId: row.taskId,
    title: row.title,
    rank: Number(row.rank),
  }));
  return { data };
}

export const searchService = { search };
