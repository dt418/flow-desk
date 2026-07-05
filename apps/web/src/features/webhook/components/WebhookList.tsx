import type { Webhook } from '@flow-desk/shared/webhook';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface WebhookListProps {
  webhooks: Webhook[];
  onDelete: (id: string) => void;
  onViewDeliveries: (id: string) => void;
}

export function WebhookList({ webhooks, onDelete, onViewDeliveries }: WebhookListProps) {
  return (
    <div className="space-y-2">
      {webhooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No webhooks configured.</p>
      ) : (
        webhooks.map((webhook) => (
          <div key={webhook.id} className="flex items-center justify-between rounded-md border p-3">
            <div className="flex-1">
              <div className="font-medium truncate">{webhook.url}</div>
              <div className="text-sm text-muted-foreground">
                <Badge variant={webhook.isActive ? 'default' : 'secondary'}>
                  {webhook.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <span className="ml-2">{webhook.events.length} event(s)</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onViewDeliveries(webhook.id)}>
                  View Deliveries
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(webhook.id)} className="text-destructive">
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))
      )}
    </div>
  );
}
