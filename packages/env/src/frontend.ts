import { z } from 'zod';

export const frontendSchema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:3000'),
  VITE_APP_NAME: z.string().default('FlowDesk'),
  VITE_STRIPE_PUBLIC_KEY: z.string().optional(),
});

export type FrontendEnv = z.infer<typeof frontendSchema>;

export function parseFrontendEnv(env: Record<string, unknown>): FrontendEnv {
  return frontendSchema.parse(env);
}
