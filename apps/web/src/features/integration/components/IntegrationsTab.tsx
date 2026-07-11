import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Slack, GitBranch, Trash2, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useWorkspaceRole } from '@/features/workspace/hooks';
import { canManageMembers } from '@/features/workspace/components/role';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

type Integration = {
  id: string;
  provider: 'SLACK' | 'GITLAB';
  externalAccountId: string;
  externalAccountName: string;
  scopes: string[];
  createdAt: string;
};

async function listIntegrations(workspaceId: string): Promise<Integration[]> {
  const res = await api<{ data: Integration[] }>(
    `/api/integrations?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return res.data;
}

async function revokeIntegration(workspaceId: string, id: string): Promise<void> {
  await api(`/api/integrations/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE',
  });
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
        (configured
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
          : 'bg-muted text-muted-foreground')
      }
    >
      {configured ? 'Configured' : 'Not configured'}
    </span>
  );
}

function ProviderCard({
  provider,
  name,
  description,
  Icon,
  configured,
  integration,
  onConnect,
  onRevoke,
  pending,
}: {
  provider: 'slack' | 'gitlab';
  name: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  configured: boolean;
  integration?: Integration;
  onConnect: () => void;
  onRevoke: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{name}</h3>
            <StatusBadge configured={configured} />
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          {integration && (
            <p className="text-xs text-muted-foreground">
              Connected to <span className="font-medium">{integration.externalAccountName}</span>
              {' · '}
              {integration.scopes.join(', ')}
            </p>
          )}
          {!configured && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Server env vars missing — ask the operator to set {provider.toUpperCase()}_* before
              you can connect.
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {integration ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRevoke}
            disabled={pending}
            aria-label={`Disconnect ${name}`}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Disconnect
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={onConnect}
            disabled={!configured || pending}
            aria-label={`Connect ${name}`}
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

export function IntegrationsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const role = useWorkspaceRole(workspaceId ?? '');
  const canManage = canManageMembers(role);
  const qc = useQueryClient();
  const [pending, setPending] = useState<'slack' | 'gitlab' | null>(null);

  const integrations = useQuery({
    queryKey: ['integrations', workspaceId],
    queryFn: () => listIntegrations(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const slackConfig = useQuery({
    queryKey: ['integrations', 'slack', 'status'],
    queryFn: () => api<{ configured: boolean }>('/api/integrations/slack/status'),
  });
  const gitlabConfig = useQuery({
    queryKey: ['integrations', 'gitlab', 'status'],
    queryFn: () => api<{ configured: boolean }>('/api/integrations/gitlab/status'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeIntegration(workspaceId!, id),
    onSuccess: () => {
      toast.success('Integration disconnected');
      qc.invalidateQueries({ queryKey: ['integrations', workspaceId] });
    },
    onError: (e: Error) => toast.error(`Disconnect failed: ${e.message}`),
  });

  if (!workspaceId) return null;
  if (!canManage) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        Only workspace admins and owners can manage integrations.
      </div>
    );
  }

  const rows = integrations.data ?? [];
  const slack = rows.find((r) => r.provider === 'SLACK');
  const gitlab = rows.find((r) => r.provider === 'GITLAB');

  const connect = (provider: 'slack' | 'gitlab') => {
    setPending(provider);
    // Full-page navigation so the OAuth provider's Set-Cookie state cookies
    // travel with the browser back to the callback.
    window.location.href = `/api/integrations/${provider}/connect?workspaceId=${encodeURIComponent(workspaceId)}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect external services so FlowDesk can post updates, link issues, and run automation
          actions against them.
        </p>
      </div>
      <div className="space-y-3">
        <ProviderCard
          provider="slack"
          name="Slack"
          description="Post messages and run slash commands from Slack."
          Icon={Slack}
          configured={slackConfig.data?.configured ?? false}
          integration={slack}
          onConnect={() => connect('slack')}
          onRevoke={() => revoke.mutate(slack!.id)}
          pending={pending === 'slack' || revoke.isPending}
        />
        <ProviderCard
          provider="gitlab"
          name="GitLab"
          description="Link FlowDesk tasks to GitLab issues, show MR status."
          Icon={GitBranch}
          configured={gitlabConfig.data?.configured ?? false}
          integration={gitlab}
          onConnect={() => connect('gitlab')}
          onRevoke={() => revoke.mutate(gitlab!.id)}
          pending={pending === 'gitlab' || revoke.isPending}
        />
      </div>
    </div>
  );
}
