import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prismaDir = path.resolve(
  __dirname,
  'packages/db/prisma',
);

export default defineConfig({
  schema: path.join(prismaDir, 'schema.prisma'),

  migrations: {
    path: path.join(prismaDir, 'migrations'),
    seed: `tsx ${path.join(prismaDir, 'seed.ts')}`,
  },

  datasource: {
    url: env('DATABASE_URL'),
  },
});