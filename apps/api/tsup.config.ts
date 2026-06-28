import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/workers/email/email-worker.ts'],
  format: ['cjs'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  platform: 'node',
  external: ['@prisma/client', '.prisma/client', 'prisma'],
  shims: true,
});
