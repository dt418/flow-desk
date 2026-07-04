import type { SearchResult } from '@flow-desk/shared/search';
import { api } from '@/lib/api';
import { searchResponseSchema } from './schemas';

export const searchApi = {
  search(q: string, limit = 20) {
    const qs = `?q=${encodeURIComponent(q)}&limit=${limit}`;
    return api<{ data: SearchResult[] }>(`/api/search${qs}`, {
      schema: searchResponseSchema,
    });
  },
};
