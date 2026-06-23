import { test as base, type Page, type BrowserContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createUser, createWorkspace, addMember, cleanDatabase } from '../apps/api/tests/setup/factories';

const prisma = new PrismaClient();

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
}>({
  db: [
    async ({}, use) => {
      await cleanDatabase();
      await use();
      await cleanDatabase();
    },
    { auto: true, scope: 'worker' },
  ],
  seedUser: async ({}, use) => {
    const password = 'e2epass123';
    const user = await createUser({ email: `e2e-${Date.now()}@flow-desk.app`, password });
    const ws = await createWorkspace({ name: 'E2E Workspace', ownerId: user.id });
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

export async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/(w|dashboard)/, { timeout: 10_000 });
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