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

const registerSchema = z
  .object({
    name: z.string().min(1, 'Name is required.').max(80, 'Name is too long.'),
    email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(128, 'Password is too long.'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  });
type RegisterInput = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await registerUser(values.name, values.email, values.password);
      toast.success('Account created', { description: 'Welcome to FlowDesk.' });
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
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
        aria-label="Sign up form"
      >
        <div className="space-y-1">
          <h1 className="text-[20px] font-semibold tracking-tight">Create account</h1>
          <p className="caption">Spin up your FlowDesk workspace</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Jane Doe"
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
          />
          {errors.name && <p className="text-[11px] text-red-500">{errors.name.message}</p>}
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
          {errors.email && <p className="text-[11px] text-red-500">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Min 8 characters"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
          {errors.password && (
            <p className="text-[11px] text-red-500">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirm)}
            {...register('confirm')}
          />
          {errors.confirm && (
            <p className="text-[11px] text-red-500">{errors.confirm.message}</p>
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
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>

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
