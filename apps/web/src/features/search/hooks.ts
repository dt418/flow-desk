import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from './api';

export const searchKeys = {
  list: (q: string) => ['search', q] as const,
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useSearch(q: string, enabled = true) {
  const debounced = useDebouncedValue(q, 200);
  return useQuery({
    queryKey: searchKeys.list(debounced),
    queryFn: () => searchApi.search(debounced),
    enabled: enabled && debounced.trim().length > 0,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}
