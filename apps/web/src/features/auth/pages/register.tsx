import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../store';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(email, password, name);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-[var(--bg)] p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4" aria-label="Sign up form">
        <div>
          <h1>Create account</h1>
          <p className="caption mt-1">Start managing tasks with FlowDesk</p>
        </div>

        <label className="block">
          <span className="label-xs">Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 outline-none focus:border-emerald-500"
          />
        </label>

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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 outline-none focus:border-emerald-500"
          />
          <span className="caption mt-1 block">Min 8 chars, with upper, lower, and a digit.</span>
        </label>

        {error && (
          <div role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
          {busy ? 'Creating…' : 'Create account'}
        </button>

        <p className="caption text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-emerald-500 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
