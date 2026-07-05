import { useState } from 'react';
import { useWebhookDeliveries } from '../hooks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface WebhookDeliveryLogProps {
  workspaceId: string;
  webhookId: string;
  onClose: () => void;
}

export function WebhookDeliveryLog({ workspaceId, webhookId, onClose }: WebhookDeliveryLogProps) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading } = useWebhookDeliveries(workspaceId, webhookId, cursor);

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    SUCCESS: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    ERROR: 'bg-red-200 text-red-900',
  };

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Delivery Log</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Attempted At</TableHead>
                <TableHead>Response</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.data || []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Badge className={statusColors[d.status] || ''}>{d.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(d.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{d.responseCode || d.error || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
