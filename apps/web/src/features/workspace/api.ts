import { api } from '@/lib/api';
import type {
  UpdateWorkspaceInput,
  InviteMemberInput,
  UpdateMemberInput,
  CreateColumnInput,
  UpdateColumnInput,
} from '@flow-desk/shared/workspace';
import type { WorkspaceDetail, MemberRow, Column } from './types';

export const workspaceApi = {
  get(workspaceId: string) {
    return api<{ workspace: WorkspaceDetail }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}`,
    );
  },
  update(workspaceId: string, body: UpdateWorkspaceInput) {
    return api<{ workspace: WorkspaceDetail }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: 'PATCH', json: body },
    );
  },
  remove(workspaceId: string) {
    return api<{ ok: true }>(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
    });
  },
  members(workspaceId: string) {
    return api<{ data: MemberRow[]; nextCursor: string | null }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
    );
  },
  inviteMember(workspaceId: string, body: InviteMemberInput) {
    return api<{ member: MemberRow }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
      { method: 'POST', json: body },
    );
  },
  updateMember(workspaceId: string, userId: string, body: UpdateMemberInput) {
    return api<{ member: MemberRow }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
      { method: 'PATCH', json: body },
    );
  },
  removeMember(workspaceId: string, userId: string) {
    return api<{ ok: true }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
  },
  columns(workspaceId: string): Promise<Column[]> {
    return api<{ workspace: WorkspaceDetail }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}`,
    ).then((r) => r.workspace.columns ?? []);
  },
  createColumn(workspaceId: string, body: CreateColumnInput) {
    return api<{ column: Column }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/columns`, {
      method: 'POST',
      json: body,
    });
  },
  updateColumn(workspaceId: string, columnId: string, body: UpdateColumnInput) {
    return api<{ column: Column }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/columns/${encodeURIComponent(columnId)}`,
      { method: 'PATCH', json: body },
    );
  },
  deleteColumn(workspaceId: string, columnId: string) {
    return api<{ ok: true }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/columns/${encodeURIComponent(columnId)}`,
      { method: 'DELETE' },
    );
  },
  board(workspaceId: string) {
    return api<{
      columns: Array<{ id: string; name: string; position: number; isDoneColumn: boolean }>;
    }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/board`);
  },
};
