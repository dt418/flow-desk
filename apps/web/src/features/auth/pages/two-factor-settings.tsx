import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '../store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SetupResponse {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export default function TwoFactorSettingsPage() {
  const { user, checkAuth } = useAuth();
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState('');
  const [busy, setBusy] = useState(false);

  const enabled = user?.twoFactorEnabled === true;

  async function startSetup() {
    setBusy(true);
    try {
      const data = await api<SetupResponse>('/api/auth/2fa/setup', { method: 'POST' });
      setSetup(data);
      setBackupCodes(null);
      toast.success('Scan the QR code with your authenticator app');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    try {
      const data = await api<{ enabled: boolean; backupCodes: string[] }>('/api/auth/2fa/verify', {
        method: 'POST',
        json: { code },
      });
      setBackupCodes(data.backupCodes);
      setSetup(null);
      setCode('');
      await checkAuth();
      toast.success('Two-factor authentication enabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await api('/api/auth/2fa/disable', {
        method: 'POST',
        json: { code: disableCode },
      });
      setDisableCode('');
      setBackupCodes(null);
      await checkAuth();
      toast.success('Two-factor authentication disabled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disable 2FA');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
        <p className="text-sm text-muted-foreground">
          Protect your account with a TOTP authenticator app (Google Authenticator, 1Password, …).
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <p className="text-sm">
          Status:{' '}
          <span className={enabled ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </p>
      </div>

      {!enabled && !setup && (
        <Button onClick={startSetup} disabled={busy}>
          {busy ? 'Starting…' : 'Enable 2FA'}
        </Button>
      )}

      {setup && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <p className="text-sm">Scan this QR code, then enter the 6-digit code to confirm:</p>
          <img src={setup.qrDataUrl} alt="TOTP QR code" className="mx-auto h-48 w-48" />
          <p className="break-all text-center font-mono text-xs text-muted-foreground">
            {setup.secret}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="totp-code">Authenticator code</Label>
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </div>
          <Button onClick={confirmSetup} disabled={busy || code.length < 6}>
            Confirm and enable
          </Button>
        </div>
      )}

      {backupCodes && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium">Save these backup codes now — shown once:</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {enabled && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Enter a current TOTP or unused backup code to disable 2FA.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="disable-code">Code</Label>
            <Input
              id="disable-code"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="123456"
            />
          </div>
          <Button variant="destructive" onClick={disable} disabled={busy || disableCode.length < 6}>
            Disable 2FA
          </Button>
        </div>
      )}
    </div>
  );
}
