import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});
type LoginInput = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      toast.success('Welcome back');
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setServerError(message);
      toast.error(message);
    }
  });

  return (
    <div className="flex h-full items-center justify-center bg-[var(--bg)] p-4">
      <form
        onSubmit={onSubmit}
        noValidate
        className="w-full max-w-sm space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/80 p-6 shadow-sm backdrop-blur-sm"
        aria-label="Sign in form"
      >
        <div className="space-y-1">
          <h1 className="text-[20px] font-semibold tracking-tight">Sign in</h1>
          <p className="caption">Welcome back to FlowDesk</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-[11px] text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          {errors.password && (
            <p className="text-[11px] text-red-500">{errors.password.message}</p>
          )}
        </div>

        {serverError && (
          <div
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-500"
          >
            {serverError}
          </div>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          variant="default"
          className="h-9 w-full bg-emerald-500 text-white hover:bg-emerald-600"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>

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
