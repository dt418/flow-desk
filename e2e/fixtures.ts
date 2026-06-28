import { test as base, type Page, type BrowserContext } from '@playwright/test';
import { PrismaClient } from '../packages/db/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

function e2eDbUrl(): string {
  const port = process.env.DB_PORT ?? '5432';
  return process.env.DATABASE_URL ?? `postgresql://flowdesk:flowdesk@127.0.0.1:${port}/flowdesk?schema=public`;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: e2eDbUrl() }) });

let idCounter = 0;
function uniq(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

async function cleanDatabase(p: PrismaClient): Promise<void> {
  await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    const tables = await tx.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_%'
    `;
    for (const { tablename } of tables) {
      await tx.$executeRawUnsafe(`DELETE FROM "${tablename}"`);
    }
    await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }, { timeout: 30000 });
}

async function createUser(p: PrismaClient, email: string, name: string): Promise<{ id: string; email: string; name: string }> {
  const user = await p.user.create({ data: { email, name } });
  return { id: user.id, email: user.email, name: user.name };
}

async function createWorkspace(p: PrismaClient, ownerId: string, name: string): Promise<{ id: string; name: string; ownerId: string }> {
  const slug = `ws-${uniq('s')}`.toLowerCase();
  const ws = await p.workspace.create({
    data: {
      name, slug, ownerId,
      members: { create: { userId: ownerId, role: 'OWNER' } },
      columns: {
        create: [
          { name: 'Backlog', position: 0, isDoneColumn: false },
          { name: 'Todo', position: 1, isDoneColumn: false },
          { name: 'In Progress', position: 2, isDoneColumn: false },
          { name: 'Done', position: 3, isDoneColumn: true },
        ],
      },
    },
  });
  return { id: ws.id, name: ws.name, ownerId: ws.ownerId };
}

export interface SeededUser {
  id: string;
  email: string;
  password: string;
  workspaceId: string;
  workspaceName: string;
}

export const test = base.extend<{
  db: void;
  seedUser: SeededUser;
  loginAs: (email: string, password: string) => Promise<void>;
  apiContext: { baseURL: string };
  hideDevtools: void;
}>({
  hideDevtools: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        const style = document.createElement('style');
        style.textContent = '.tsqd-parent-container { display: none !important }';
        document.head.appendChild(style);
      });
      await use();
    },
    { auto: true },
  ],
  db: [
    async ({}, use) => {
      await cleanDatabase(prisma);
      await use();
      await cleanDatabase(prisma);
    },
    { auto: true, scope: 'worker' },
  ],
  seedUser: async ({}, use) => {
    const password = 'e2epass123';
    const email = `e2e-${Date.now()}@flow-desk.app`;
    const user = await createUser(prisma, email, 'E2E User');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    const ws = await createWorkspace(prisma, user.id, 'E2E Workspace');
    await use({
      id: user.id,
      email: user.email,
      password,
      workspaceId: ws.id,
      workspaceName: ws.name,
    });
  },
  apiContext: async ({}, use) => {
    const baseURL = process.env.API_BASE_URL ?? 'http://localhost:3000';
    await use({ baseURL });
  },
});

export { expect } from '@playwright/test';
export type { Page, BrowserContext };

export async function closeDevtools(page: Page) {
  const btn = page.locator('button[title*="Tanstack"]').first();
  if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
    await btn.click();
  }
}

export async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/$|\/(board|dashboard)/, { timeout: 15_000 });
}

export async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:3000'}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/access_token=([^;]+)/);
  if (!match) throw new Error('No access_token cookie in response');
  return `access_token=${match[1]}`;
}

export { prisma };
