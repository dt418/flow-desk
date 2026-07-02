import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useCreateWorkspace, type WorkspaceDetail } from '@/features/workspace';
import {
  createWorkspaceSchema,
  type CreateWorkspaceInput,
  type WorkspaceVisibility,
} from '@flow-desk/shared/workspace';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base.length > 0 ? base.slice(0, 40) : 'workspace';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (workspace: WorkspaceDetail) => void;
}

export function WorkspaceCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const create = useCreateWorkspace();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: '', slug: '', description: '', visibility: 'PRIVATE' },
  });

  // Track whether the user has manually edited the slug.
  const slugTouchedRef = React.useRef(false);

  React.useEffect(() => {
    if (open) {
      slugTouchedRef.current = false;
      reset({ name: '', slug: '', description: '', visibility: 'PRIVATE' });
    }
  }, [open, reset]);

  // Auto-generate slug from name unless the user has manually edited the slug.
  const nameValue = watch('name');
  React.useEffect(() => {
    if (!slugTouchedRef.current) {
      setValue('slug', slugify(nameValue ?? ''));
    }
  }, [nameValue, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await create.mutateAsync(values);
      toast.success('Workspace created');
      onOpenChange(false);
      onCreated?.(result.workspace);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create workspace');
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            Create a workspace to organize your tasks, columns, and team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              placeholder="Acme Inc."
              autoFocus
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive" role="status">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-slug">Slug</Label>
            <Input
              id="ws-slug"
              placeholder="acme-inc"
              aria-invalid={Boolean(errors.slug)}
              {...register('slug', {
                onChange: () => {
                  slugTouchedRef.current = true;
                },
              })}
            />
            {errors.slug && (
              <p className="text-xs text-destructive" role="status">
                {errors.slug.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-desc">Description</Label>
            <textarea
              id="ws-desc"
              placeholder="What this workspace is for"
              rows={3}
              className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
              {...register('description')}
            />
            {errors.description && (
              <p className="text-xs text-destructive" role="status">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Visibility</Label>
            <Select
              defaultValue="PRIVATE"
              onValueChange={(value) =>
                setValue('visibility', value as WorkspaceVisibility)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">Private</SelectItem>
                <SelectItem value="PUBLIC">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="px-4">
              {isSubmitting ? 'Creating…' : 'Create workspace'}
              {!isSubmitting && <Plus className="ml-1.5 h-4 w-4" />}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
