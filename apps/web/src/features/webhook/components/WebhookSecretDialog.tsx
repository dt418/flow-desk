import { useWebhook } from '../hooks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface WebhookSecretDialogProps {
  workspaceId: string;
  webhookId: string;
  onClose: () => void;
}

export function WebhookSecretDialog({ workspaceId, webhookId, onClose }: WebhookSecretDialogProps) {
  const { data: webhook, isLoading } = useWebhook(workspaceId, webhookId);

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Webhook Secret</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p>This is your webhook secret. Keep it secure and do not share it.</p>
          <div>
            <Label htmlFor="secret">Secret</Label>
            <Input id="secret" value={webhook?.secret || ''} readOnly className="font-mono" />
          </div>
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
