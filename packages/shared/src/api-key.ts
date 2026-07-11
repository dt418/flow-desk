import { z } from 'zod';

export const apiKeyScopeSchema = z.enum(['read', 'write']);
export const apiKeyScopesSchema = z.array(apiKeyScopeSchema).default(['read']);

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  scopes: apiKeyScopesSchema,
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

// The plain key is returned exactly once on create.
export const apiKeyCreatedSchema = apiKeySchema.extend({
  key: z.string().regex(/^fdkey_/),
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;
