import { z } from 'zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useUpdateWorkspace, useWorkspace } from '../hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';

const generalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Name is too long'),
  description: z.string().max(500, 'Description is too long').optional(),
  visibility: z.enum(['PRIVATE', 'PUBLIC']),
});
type GeneralInput = z.infer<typeof generalSchema>;

interface Props {
  workspaceId: string;
}

export function GeneralTab({ workspaceId }: Props) {
  const ws = useWorkspace(workspaceId);
  const update = useUpdateWorkspace(workspaceId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<GeneralInput>({
    resolver: zodResolver(generalSchema),
    defaultValues: { name: '', description: '', visibility: 'PRIVATE' },
  });

  useEffect(() => {
    if (ws.data) {
      reset({
        name: ws.data.name,
        description: ws.data.description ?? '',
        visibility: ws.data.visibility,
      });
    }
  }, [ws.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        name: values.name,
        description: values.description ?? null,
        visibility: values.visibility,
      });
      toast.success('Workspace updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update workspace');
    }
  });

  if (ws.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-5">
      <div className="space-y-1.5">
        <Label htmlFor="ws-name">Name</Label>
        <Input
          id="ws-name"
          {...register('name')}
          aria-invalid={Boolean(errors.name)}
          placeholder="Acme Inc."
        />
        {errors.name && <p className="text-[11px] text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ws-desc">Description</Label>
        <textarea
          id="ws-desc"
          {...register('description')}
          aria-invalid={Boolean(errors.description)}
          placeholder="What this workspace is for"
          rows={3}
          className="flex w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-[13px] placeholder:text-[var(--fg-3)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
        />
        {errors.description && (
          <p className="text-[11px] text-red-500">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ws-vis">Visibility</Label>
        <select
          id="ws-vis"
          {...register('visibility')}
          className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
        >
          <option value="PRIVATE">Private — invite only</option>
          <option value="PUBLIC">Public — discoverable by slug</option>
        </select>
        <p className="caption">
          Slug <span className="font-mono">/{ws.data?.slug}</span> is permanent.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="h-9 bg-emerald-500 px-4 text-[12px] text-white hover:bg-emerald-600"
        >
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
