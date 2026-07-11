import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createWebhookSchema, type CreateWebhookInput } from '@flow-desk/shared/webhook';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { activityActionEnumSchema, type ActivityActionEnum } from '@flow-desk/shared/webhook';

interface WebhookFormProps {
  onSubmit: (data: CreateWebhookInput) => void;
}

export function WebhookForm({ onSubmit }: WebhookFormProps) {
  const form = useForm<CreateWebhookInput>({
    resolver: zodResolver(createWebhookSchema),
    defaultValues: {
      events: [],
      isActive: true,
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  const selectedEvents = form.watch('events');

  const toggleEvent = (event: string) => {
    const current = selectedEvents || [];
    const updated = current.includes(event as ActivityActionEnum)
      ? current.filter((e) => e !== event)
      : [...current, event as ActivityActionEnum];
    form.setValue('events', updated);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="url">Webhook URL</Label>
        <Input id="url" {...form.register('url')} placeholder="https://example.com/webhook" />
        {form.formState.errors.url && (
          <p className="text-sm text-destructive">{form.formState.errors.url.message}</p>
        )}
      </div>

      <div>
        <Label>Events</Label>
        <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
          {activityActionEnumSchema.options.map((opt) => (
            <div key={opt} className="flex items-center space-x-2">
              <Checkbox
                id={`event-${opt}`}
                checked={selectedEvents?.includes(opt as ActivityActionEnum) || false}
                onCheckedChange={() => toggleEvent(opt)}
              />
              <label
                htmlFor={`event-${opt}`}
                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {opt}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="isActive"
          checked={form.watch('isActive')}
          onCheckedChange={(checked: boolean) => form.setValue('isActive', checked)}
        />
        <Label htmlFor="isActive">Active</Label>
      </div>

      <Button type="submit">Create Webhook</Button>
    </form>
  );
}
