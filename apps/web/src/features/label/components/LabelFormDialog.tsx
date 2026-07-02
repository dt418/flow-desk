import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Check, Plus } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import { useCreateLabel, useUpdateLabel } from '../hooks';
import { contrastText, colorToHex, LabelChip } from './LabelChip';
import {
  LABEL_COLOR_HEX,
  LABEL_COLOR_LABEL,
  LABEL_COLOR_ORDER,
  type Label as LabelType,
  type LabelColor,
} from '../types';

const NAME_RE = /^[a-zA-Z0-9 _-]+$/;

const labelSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(50, 'Name is too long')
    .regex(NAME_RE, 'Only letters, digits, space, underscore, hyphen'),
  color: z.enum(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray']),
});
type LabelFormInput = z.infer<typeof labelSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  initial?: LabelType | null;
}

export function LabelFormDialog({ open, onClose, workspaceId, initial }: Props) {
  const create = useCreateLabel(workspaceId);
  const update = useUpdateLabel(workspaceId);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LabelFormInput>({
    resolver: zodResolver(labelSchema),
    defaultValues: { name: '', color: 'blue' },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        name: initial?.name ?? '',
        color: (initial?.color as LabelColor) ?? 'blue',
      });
    }
  }, [open, initial, reset]);

  const color = watch('color');
  const name = watch('name');

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit && initial) {
        await update.mutateAsync({
          labelId: initial.id,
          body: { name: values.name, color: values.color },
        });
        toast.success('Label updated');
      } else {
        await create.mutateAsync({ name: values.name, color: values.color });
        toast.success('Label created');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save label');
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit label' : 'New label'}</DialogTitle>
          <DialogDescription>
            Labels help you group and filter tasks across columns.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label-name">Name</Label>
            <Input
              id="label-name"
              placeholder="bug"
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
            <Label>Color</Label>
            <div role="radiogroup" aria-label="Label color" className="grid grid-cols-4 gap-2">
              {LABEL_COLOR_ORDER.map((c) => {
                const hex = LABEL_COLOR_HEX[c];
                const selected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={LABEL_COLOR_LABEL[c]}
                    onClick={() => setValue('color', c, { shouldDirty: true })}
                    className={cn(
                      'flex h-9 items-center justify-center gap-2 rounded-md border px-2 transition-all',
                      selected
                        ? 'border-foreground ring-2 ring-foreground/30'
                        : 'border-transparent hover:scale-[1.02]',
                    )}
                    style={{ backgroundColor: hex, color: contrastText(hex) }}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                    <span className="text-[12px] font-medium">{LABEL_COLOR_LABEL[c]}</span>
                  </button>
                );
              })}
            </div>
            {errors.color && <p className="text-[11px] text-red-500">{errors.color.message}</p>}
          </div>

          {name && color && (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-2.5">
              <span className="caption">Preview</span>
              <LabelChip label={{ id: 'preview', name, color }} size="md" />
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {colorToHex(color)}
              </span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="px-4"
            >
              {isSubmitting
                ? isEdit
                  ? 'Saving…'
                  : 'Creating…'
                : isEdit
                  ? 'Save changes'
                  : 'Create label'}
              {!isSubmitting && !isEdit && <Plus className="ml-1.5 h-4 w-4" />}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
