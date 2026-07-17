import { z } from 'zod';
import { loginSchema, registerSchema, changePasswordSchema } from './user';

export const authResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    avatarUrl: z.string().url().nullable(),
    twoFactorEnabled: z.boolean().optional(),
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

/** Login when 2FA is enabled — password OK, TOTP still required. */
export const twoFactorChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  challengeToken: z.string().min(10),
});
export type TwoFactorChallenge = z.infer<typeof twoFactorChallengeSchema>;

export const login2faSchema = z.object({
  /** Optional when challenge is carried in httpOnly cookie (Google OAuth 2FA path). */
  challengeToken: z.string().min(10).optional(),
  code: z.string().min(6).max(16),
});
export type Login2faInput = z.infer<typeof login2faSchema>;

export const verify2faSetupSchema = z.object({
  code: z.string().min(6).max(8),
});
export type Verify2faSetupInput = z.infer<typeof verify2faSetupSchema>;

export const disable2faSchema = z.object({
  code: z.string().min(6).max(16),
});
export type Disable2faInput = z.infer<typeof disable2faSchema>;

export const twoFactorSetupResponseSchema = z.object({
  secret: z.string().min(10),
  otpauthUrl: z.string().url(),
  qrDataUrl: z.string().min(10),
});
export type TwoFactorSetupResponse = z.infer<typeof twoFactorSetupResponseSchema>;

export { loginSchema, registerSchema, changePasswordSchema };
export type { LoginInput, RegisterInput, ChangePasswordInput } from './user';
