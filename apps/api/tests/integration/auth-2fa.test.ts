import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, getAuthCookie } from '../setup/factories';
import { buildApp } from '../../src/app';
import { encryptTotpSecret, generateBackupCodes } from '../../src/modules/auth/totp';
import { generateTotpSecret, generateTotpToken } from '../../src/modules/auth/totp-engine';

describe('2FA TOTP (P1-5)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  async function userWithPassword(email = '2fa@test.local', password = 'Password1!') {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, name: 'TwoFA', passwordHash },
    });
    return { user, password };
  }

  it('setup → verify enables 2FA and returns backup codes', async () => {
    const { user } = await userWithPassword();
    const cookie = await getAuthCookie(prisma, user.id);
    const app = buildApp();

    const setupRes = await app.request('/api/auth/2fa/setup', {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(setupRes.status).toBe(200);
    const setup = await setupRes.json();
    expect(setup.secret).toBeTruthy();
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\//);
    expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const token = generateTotpToken(setup.secret);
    const verifyRes = await app.request('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ code: token }),
    });
    expect(verifyRes.status).toBe(200);
    const verified = await verifyRes.json();
    expect(verified.enabled).toBe(true);
    expect(verified.backupCodes).toHaveLength(8);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.twoFactorEnabled).toBe(true);
    expect(dbUser?.twoFactorSecret).toBeTruthy();
    expect(dbUser?.twoFactorSecret).not.toBe(setup.secret); // encrypted at rest
  });

  it('login with 2FA requires challenge then TOTP', async () => {
    const password = 'Password1!';
    const passwordHash = await bcrypt.hash(password, 10);
    const secret = generateTotpSecret();
    const user = await prisma.user.create({
      data: {
        email: 'challenge@test.local',
        name: 'Challenger',
        passwordHash,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
        twoFactorBackupCodes: [],
      },
    });

    const app = buildApp();
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password }),
    });
    expect(loginRes.status).toBe(200);
    const challenge = await loginRes.json();
    expect(challenge.twoFactorRequired).toBe(true);
    expect(challenge.challengeToken).toBeTruthy();
    expect(challenge.user).toBeUndefined();

    const bad = await app.request('/api/auth/login/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code: '000000' }),
    });
    expect(bad.status).toBe(401);

    const code = generateTotpToken(secret);
    const ok = await app.request('/api/auth/login/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.user.email).toBe(user.email);
    const setCookie = ok.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/access_token=/);
  });

  it('backup code works once then is rejected', async () => {
    const password = 'Password1!';
    const passwordHash = await bcrypt.hash(password, 10);
    const secret = generateTotpSecret();
    const { plain, hashes } = await generateBackupCodes(2);
    const user = await prisma.user.create({
      data: {
        email: 'backup@test.local',
        name: 'Backup',
        passwordHash,
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
        twoFactorBackupCodes: hashes,
      },
    });

    const app = buildApp();
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password }),
    });
    const { challengeToken } = await loginRes.json();

    const first = await app.request('/api/auth/login/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken, code: plain[0] }),
    });
    expect(first.status).toBe(200);

    // Login again with same backup code → fail
    const login2 = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password }),
    });
    const { challengeToken: ct2 } = await login2.json();
    const second = await app.request('/api/auth/login/2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: ct2, code: plain[0] }),
    });
    expect(second.status).toBe(401);
  });

  it('disable 2FA with valid TOTP clears flags', async () => {
    const secret = generateTotpSecret();
    const user = await createUser(prisma, 'disable@test.local', 'Disabler');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash('Password1!', 10),
        twoFactorEnabled: true,
        twoFactorSecret: encryptTotpSecret(secret),
      },
    });
    const cookie = await getAuthCookie(prisma, user.id);
    const app = buildApp();
    const code = generateTotpToken(secret);
    const res = await app.request('/api/auth/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ code }),
    });
    expect(res.status).toBe(200);
    const db = await prisma.user.findUnique({ where: { id: user.id } });
    expect(db?.twoFactorEnabled).toBe(false);
    expect(db?.twoFactorSecret).toBeNull();
  });

  it('register on soft-deleted email returns 409 (not 500)', async () => {
    const { user } = await userWithPassword('softreg@test.local', 'Password1!');
    // Soft-delete via raw SQL
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "deletedAt" = NOW() WHERE id = '${user.id}'`);
    const app = buildApp();
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'softreg@test.local', name: 'Other', password: 'Test1234!' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('CONFLICT');
  });

  it('login on soft-deleted email returns 401 Invalid credentials', async () => {
    const { user, password } = await userWithPassword('softlogin@test.local');
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "deletedAt" = NOW() WHERE id = '${user.id}'`);
    const app = buildApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'softlogin@test.local', password }),
    });
    expect(res.status).toBe(401);
  });
});
