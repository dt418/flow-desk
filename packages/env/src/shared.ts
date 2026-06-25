import { z } from 'zod';

export const sharedSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type SharedEnv = z.infer<typeof sharedSchema>;

export function parseSharedEnv(env: Record<string, string | undefined>): SharedEnv {
  return sharedSchema.parse(env);
}
