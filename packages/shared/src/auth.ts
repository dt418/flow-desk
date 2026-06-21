import { z } from 'zod';
import { loginSchema, registerSchema, changePasswordSchema } from './user';

export const authResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().url().nullable(),
  }),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const oauthCallbackSchema = z.object({
  code: z.string().min(10),
  state: z.string().min(10),
});
export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;

export { loginSchema, registerSchema, changePasswordSchema };
export type { LoginInput, RegisterInput, ChangePasswordInput } from './user';
