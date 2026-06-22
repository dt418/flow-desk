import type { UserRole } from '@flow-desk/shared/user';
import { cn } from '@/lib/utils';

export const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  GUEST: 'Guest',
};

export const ROLE_TONE: Record<UserRole, string> = {
  OWNER: 'border-emerald-500/40 text-emerald-600',
  ADMIN: 'border-blue-500/40 text-blue-600',
  MEMBER: 'border-slate-400/40 text-slate-500',
  GUEST: 'border-slate-300/40 text-slate-400',
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        ROLE_TONE[role],
        className,
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function canManageMembers(role: UserRole | null): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canChangeRoles(role: UserRole | null): boolean {
  return role === 'OWNER';
}

export function canManageColumns(role: UserRole | null): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canDeleteWorkspace(role: UserRole | null): boolean {
  return role === 'OWNER';
}
