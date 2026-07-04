import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/auth.ts',
    'src/user.ts',
    'src/workspace.ts',
    'src/task.ts',
    'src/comment.ts',
    'src/notification.ts',
    'src/attachment.ts',
    'src/common.ts',
    'src/pagination.ts',
    'src/chat.ts',
    'src/notification-preferences.ts',
    'src/search.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
});
