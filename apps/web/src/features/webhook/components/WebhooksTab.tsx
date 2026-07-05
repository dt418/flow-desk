import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWebhooks, useCreateWebhook, useDeleteWebhook } from '../hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { WebhookForm } from './WebhookForm';
import { WebhookList } from './WebhookList';
import { WebhookDeliveryLog } from './WebhookDeliveryLog';
import { WebhookSecretDialog } from './WebhookSecretDialog';
import type { CreateWebhookInput } from '@flow-desk/shared/webhook';

export function WebhooksTab() {
  const { workspaceId } = useParams<Record<string, string>>();
  const { data: webhooks, isLoading } = useWebhooks(workspaceId!);
  const createWebhookMutation = useCreateWebhook(workspaceId!);
  const deleteWebhookMutation = useDeleteWebhook(workspaceId!);

  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [showDeliveryLog, setShowDeliveryLog] = useState<string | null>(null);

  const handleCreate = (input: CreateWebhookInput) => {
    createWebhookMutation.mutate(input, {
      onSuccess: (data) => {
        setShowSecret(data.id);
      },
    });
  };

  const handleDelete = (id: string) => {
    deleteWebhookMutation.mutate(id);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Webhooks</span>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Create Webhook</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Webhook</DialogTitle>
                </DialogHeader>
                <WebhookForm onSubmit={handleCreate} />
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <WebhookList
              webhooks={webhooks || []}
              onDelete={handleDelete}
              onViewDeliveries={(id) => setShowDeliveryLog(id)}
            />
          )}
        </CardContent>
      </Card>

      {showSecret && (
        <WebhookSecretDialog
          workspaceId={workspaceId!}
          webhookId={showSecret}
          onClose={() => setShowSecret(null)}
        />
      )}

      {showDeliveryLog && (
        <WebhookDeliveryLog
          workspaceId={workspaceId!}
          webhookId={showDeliveryLog}
          onClose={() => setShowDeliveryLog(null)}
        />
      )}
    </div>
  );
}
