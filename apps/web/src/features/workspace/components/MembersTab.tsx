import { z } from 'zod';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Mail, Trash2, UserPlus } from 'lucide-react';
import { useAuth } from '@/features/auth';
import {
  useMembers,
  useInviteMember,
  useUpdateMember,
  useRemoveMember,
  useWorkspaceRole,
} from '../hooks';
import { canChangeRoles, canManageMembers, initials, RoleBadge } from './role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApiError } from '@/lib/api';
import type { MemberRow } from '../types';
import type { UserRole } from '@flow-desk/shared/user';

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email'),
  role: z.enum(['ADMIN', 'MEMBER', 'GUEST']),
});
type InviteInput = z.infer<typeof inviteSchema>;

const ROLE_OPTIONS: UserRole[] = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'];

interface Props {
  workspaceId: string;
}

export function MembersTab({ workspaceId }: Props) {
  const me = useAuth();
  const role = useWorkspaceRole(workspaceId);
  const members = useMembers(workspaceId);
  const invite = useInviteMember(workspaceId);
  const update = useUpdateMember(workspaceId);
  const remove = useRemoveMember(workspaceId);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'MEMBER' },
  });

  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);

  const onInvite = handleSubmit(async (values) => {
    try {
      await invite.mutateAsync(values);
      toast.success(`Invited ${values.email}`);
      reset({ email: '', role: 'MEMBER' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to invite');
    }
  });

  const onRoleChange = async (m: MemberRow, nextRole: UserRole) => {
    try {
      await update.mutateAsync({ userId: m.userId, role: nextRole });
      toast.success(`${m.user.name} is now ${nextRole.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to change role');
    }
  };

  const onRemove = async (m: MemberRow) => {
    setRemoveTarget(m);
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const m = removeTarget;
    setRemoveTarget(null);
    try {
      await remove.mutateAsync(m.userId);
      toast.success('Member removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove member');
    }
  };

  const canManage = canManageMembers(role);
  const canChange = canChangeRoles(role);

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <form
          onSubmit={onInvite}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="invite-email">Invite by email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                {...register('email')}
                aria-invalid={Boolean(errors.email)}
                className="pl-9"
              />
            </div>
            {errors.email && (
              <p className="text-xs text-destructive" role="status">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="w-full space-y-1.5 sm:w-32">
            <Label>Role</Label>
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="GUEST">Guest</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <Button type="submit" disabled={isSubmitting} size="sm" className="h-9 px-4">
            <UserPlus className="mr-1.5 h-4 w-4" />
            {isSubmitting ? 'Inviting…' : 'Invite'}
          </Button>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-7 w-40" />
                  </td>
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-4 w-48" />
                  </td>
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              ))
            ) : (members.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No members yet.
                </td>
              </tr>
            ) : (
              (members.data ?? []).map((m) => {
                const isSelf = me.user?.id === m.userId;
                return (
                  <tr key={m.id} className="bg-background/40">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7 text-xs">
                          {m.user.avatarUrl ? (
                            <AvatarImage src={m.user.avatarUrl} alt={m.user.name} />
                          ) : null}
                          <AvatarFallback>{initials(m.user.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {m.user.name}
                          {isSelf && (
                            <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{m.user.email}</td>
                    <td className="px-3 py-2.5">
                      {canChange && !isSelf ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => onRoleChange(m, v as UserRole)}
                        >
                          <SelectTrigger className="h-7 w-28 border border-input bg-card text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canManage && !isSelf && m.role !== 'OWNER' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onRemove(m)}
                          aria-label={`Remove ${m.user.name}`}
                          title="Remove member"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {role === 'MEMBER' || role === 'GUEST' ? (
        <p className="caption">
          Only owners and admins can change member roles. Ask an admin for help.
        </p>
      ) : null}

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && (
                <>
                  <span className="font-medium text-foreground">{removeTarget.user.name}</span> will
                  lose access to this workspace immediately. You can re-invite them later.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
              disabled={remove.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {remove.isPending ? 'Removing…' : 'Remove member'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
