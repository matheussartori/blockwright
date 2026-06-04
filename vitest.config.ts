import { defineConfig } from 'vitest/config';

// Unit tests cover the pure main-process logic (authoring compile pipeline), so a
// plain Node environment is enough — no Electron, DOM or SDK mocking required.
// `@/*` → `src/*` is resolved natively from tsconfig.json (Vite 8+).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
