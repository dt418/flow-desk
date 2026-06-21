import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../store';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-[var(--bg)] p-4">
      <form
        onSubmit={onSubmit}
        className="card w-full max-w-sm space-y-4"
        aria-label="Sign in form"
      >
        <div>
          <h1>Sign in</h1>
          <p className="caption mt-1">Welcome back to FlowDesk</p>
        </div>

        <label className="block">
          <span className="label-xs">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 outline-none focus:border-emerald-500"
          />
        </label>

        <label className="block">
          <span className="label-xs">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 outline-none focus:border-emerald-500"
          />
        </label>

        {error && (
          <div role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="caption text-center">
          No account?{' '}
          <Link to="/register" className="text-emerald-500 hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
