import { prisma } from '../../shared/lib/prisma';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../../shared/errors';
import { generateApiKey, hashApiKey, KEY_PREFIX } from './api-key-crypto';

export { generateApiKey, hashApiKey } from './api-key-crypto';

export const apiKeyService = {
  async list(userId: string) {
    const rows = await prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      scopes: r.scopes,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  async create(userId: string, name: string, scopes: string[] = ['read']) {
    if (!name.trim()) throw new BadRequestError('name required');
    const { raw, hashed, prefix } = generateApiKey();
    const row = await prisma.apiKey.create({
      data: { userId, name: name.trim(), hashedKey: hashed, prefix, scopes },
    });
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes,
      // One-time reveal
      key: raw,
      createdAt: row.createdAt.toISOString(),
    };
  },

  async revoke(userId: string, id: string) {
    const row = await prisma.apiKey.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new NotFoundError('ApiKey');
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  /** Resolve Bearer fdkey_… → userId + scopes */
  async authenticate(rawKey: string): Promise<{ userId: string; scopes: string[]; keyId: string }> {
    if (!rawKey.startsWith(KEY_PREFIX)) throw new UnauthorizedError('Invalid API key');
    const hashed = hashApiKey(rawKey);
    const row = await prisma.apiKey.findUnique({ where: { hashedKey: hashed } });
    if (!row || row.revokedAt) throw new UnauthorizedError('Invalid API key');
    await prisma.apiKey.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    return { userId: row.userId, scopes: row.scopes, keyId: row.id };
  },
};
