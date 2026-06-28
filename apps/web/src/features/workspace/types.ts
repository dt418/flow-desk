import type {
  Workspace,
  WorkspaceVisibility,
  Column,
  WorkspaceMember,
} from '@flow-desk/shared/workspace';
import type { UserRole } from '@flow-desk/shared/user';

export interface WorkspaceDetail extends Workspace {
  columns?: Column[];
}

export interface WorkspaceListEntry {
  id: string;
  name: string;
  slug: string;
  role: UserRole;
  _count?: { members: number; tasks: number };
}

export interface MemberRow extends WorkspaceMember {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
}

export type { WorkspaceVisibility, UserRole };
export type { Workspace, Column };
