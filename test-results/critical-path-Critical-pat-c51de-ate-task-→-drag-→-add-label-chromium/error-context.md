# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: critical-path.spec.ts >> Critical path @smoke >> login → workspace → create task → drag → add label
- Location: e2e/critical-path.spec.ts:4:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:5173/"
  navigated to "http://localhost:5173/"
============================================================
```

# Test source

```ts
  1  | import { test as base, type Page, type BrowserContext } from '@playwright/test';
  2  | import { PrismaClient } from '@prisma/client';
  3  | import bcrypt from 'bcryptjs';
  4  | import { createUser, createWorkspace, cleanDatabase } from '../apps/api/tests/setup/factories';
  5  | 
  6  | const prisma = new PrismaClient();
  7  | 
  8  | export interface SeededUser {
  9  |   id: string;
  10 |   email: string;
  11 |   password: string;
  12 |   workspaceId: string;
  13 |   workspaceName: string;
  14 | }
  15 | 
  16 | export const test = base.extend<{
  17 |   db: void;
  18 |   seedUser: SeededUser;
  19 |   loginAs: (email: string, password: string) => Promise<void>;
  20 |   apiContext: { baseURL: string };
  21 | }>({
  22 |   db: [
  23 |     async ({}, use) => {
  24 |       await cleanDatabase(prisma);
  25 |       await use();
  26 |       await cleanDatabase(prisma);
  27 |     },
  28 |     { auto: true, scope: 'worker' },
  29 |   ],
  30 |   seedUser: async ({}, use) => {
  31 |     const password = 'e2epass123';
  32 |     const email = `e2e-${Date.now()}@flow-desk.app`;
  33 |     const user = await createUser(prisma, email, 'E2E User');
  34 |     await prisma.user.update({
  35 |       where: { id: user.id },
  36 |       data: { passwordHash: await bcrypt.hash(password, 10) },
  37 |     });
  38 |     const ws = await createWorkspace(prisma, user.id, 'E2E Workspace');
  39 |     await use({
  40 |       id: user.id,
  41 |       email: user.email,
  42 |       password,
  43 |       workspaceId: ws.id,
  44 |       workspaceName: ws.name,
  45 |     });
  46 |   },
  47 |   apiContext: async ({}, use) => {
  48 |     const baseURL = process.env.API_BASE_URL ?? 'http://localhost:3000';
  49 |     await use({ baseURL });
  50 |   },
  51 | });
  52 | 
  53 | export { expect } from '@playwright/test';
  54 | export type { Page, BrowserContext };
  55 | 
  56 | export async function loginViaUI(page: Page, email: string, password: string) {
  57 |   await page.goto('/login');
  58 |   await page.getByLabel('Email').fill(email);
  59 |   await page.getByLabel('Password').fill(password);
  60 |   await page.getByRole('button', { name: /sign in/i }).click();
> 61 |   await page.waitForURL(/\/(w|dashboard)/, { timeout: 10_000 });
     |              ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  62 | }
  63 | 
  64 | export async function apiLogin(email: string, password: string): Promise<string> {
  65 |   const res = await fetch(`${process.env.API_BASE_URL ?? 'http://localhost:3000'}/api/auth/login`, {
  66 |     method: 'POST',
  67 |     headers: { 'content-type': 'application/json' },
  68 |     body: JSON.stringify({ email, password }),
  69 |   });
  70 |   if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  71 |   const setCookie = res.headers.get('set-cookie') ?? '';
  72 |   const match = setCookie.match(/access_token=([^;]+)/);
  73 |   if (!match) throw new Error('No access_token cookie in response');
  74 |   return `access_token=${match[1]}`;
  75 | }
  76 | 
  77 | export { prisma };
```