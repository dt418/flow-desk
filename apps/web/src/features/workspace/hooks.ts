import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workspaceApi } from './api';
import type { UserRole } from '@flow-desk/shared/user';

export const workspaceKeys = {
  all: ['workspaces'] as const,
  detail: (id: string) => ['workspace', id] as const,
  members: (id: string) => ['workspace', id, 'members'] as const,
  columns: (id: string) => ['workspace', id, 'columns'] as const,
  board: (id: string) => ['workspace', id, 'board'] as const,
};

export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.detail(workspaceId),
    queryFn: () => workspaceApi.get(workspaceId).then((r) => r.workspace),
    enabled: Boolean(workspaceId),
  });
}

export function useWorkspaceRole(workspaceId: string): UserRole | null {
  const { data } = useQuery({
    queryKey: workspaceKeys.all,
    queryFn: () => workspaceApi.list(),
    select: (response) => response?.data?.find((w) => w.id === workspaceId)?.role ?? null,
    staleTime: 30_000,
  });
  return data ?? null;
}

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.members(workspaceId),
    queryFn: () => workspaceApi.members(workspaceId).then((r) => r.data),
    enabled: Boolean(workspaceId),
  });
}

export function useColumns(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.columns(workspaceId),
    queryFn: () => workspaceApi.columns(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

export function useUpdateWorkspace(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof workspaceApi.update>[1]) =>
      workspaceApi.update(workspaceId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
      qc.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

export function useDeleteWorkspace(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => workspaceApi.remove(workspaceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.all });
    },
  });
}

export function useInviteMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof workspaceApi.inviteMember>[1]) =>
      workspaceApi.inviteMember(workspaceId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.members(workspaceId) });
    },
  });
}

export function useUpdateMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      workspaceApi.updateMember(workspaceId, userId, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.members(workspaceId) });
    },
  });
}

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => workspaceApi.removeMember(workspaceId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.members(workspaceId) });
    },
  });
}

export function useCreateColumn(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof workspaceApi.createColumn>[1]) =>
      workspaceApi.createColumn(workspaceId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.columns(workspaceId) });
      qc.invalidateQueries({ queryKey: workspaceKeys.board(workspaceId) });
    },
  });
}

export function useUpdateColumn(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      columnId,
      body,
    }: {
      columnId: string;
      body: Parameters<typeof workspaceApi.updateColumn>[2];
    }) => workspaceApi.updateColumn(workspaceId, columnId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.columns(workspaceId) });
      qc.invalidateQueries({ queryKey: workspaceKeys.board(workspaceId) });
    },
  });
}

export function useDeleteColumn(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columnId: string) => workspaceApi.deleteColumn(workspaceId, columnId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.columns(workspaceId) });
      qc.invalidateQueries({ queryKey: workspaceKeys.board(workspaceId) });
    },
  });
}
