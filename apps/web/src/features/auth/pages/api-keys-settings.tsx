import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FOCUS_RING_CLASS } from '@/lib/a11y';

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysSettingsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('CI key');
  const [revealed, setRevealed] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api<{ data: ApiKeyRow[] }>('/api/api-keys'),
  });

  const create = useMutation({
    mutationFn: () =>
      api<{ key: string; id: string }>('/api/api-keys', {
        method: 'POST',
        json: { name, scopes: ['read'] },
      }),
    onSuccess: (data) => {
      setRevealed(data.key);
      toast.success('API key created — copy it now');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Key revoked');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="text-sm text-muted-foreground">
          Use <code className="text-xs">Authorization: Bearer fdkey_…</code> against{' '}
          <code className="text-xs">/api/v1</code>.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="space-y-1.5">
          <Label htmlFor="key-name">Name</Label>
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FOCUS_RING_CLASS}
          />
        </div>
        <Button
          aria-label="Create API key"
          className={FOCUS_RING_CLASS}
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          Create key
        </Button>
      </div>

      {revealed && (
        <div
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 font-mono text-sm break-all"
        >
          {revealed}
        </div>
      )}

      <ul className="space-y-2">
        {(keys.data?.data ?? []).map((k) => (
          <li
            key={k.id}
            className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
          >
            <div>
              <div className="font-medium">{k.name}</div>
              <div className="text-xs text-muted-foreground">
                {k.prefix}… · {k.scopes.join(', ')}
              </div>
            </div>
            <Button
              size="sm"
              variant="destructive"
              aria-label={`Revoke API key ${k.name}`}
              className={FOCUS_RING_CLASS}
              onClick={() => revoke.mutate(k.id)}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
