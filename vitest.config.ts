import { defineConfig } from 'vitest/config';

// Unit tests cover the pure main-process logic (authoring compile pipeline), so a
// plain Node environment is enough — no Electron, DOM or SDK mocking required.
// `@/*` → `src/*` is resolved natively from tsconfig.json (Vite 8+).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      // Scope coverage to the pure, unit-testable logic. The renderer (React +
      // imperative Three.js), the Electron main wiring (windows/menu/IPC/protocols)
      // and the AI provider drivers run against real services/DOM, not this Node
      // suite, so including them would report misleading 0% noise.
      include: [
        'src/shared/**/*.ts',
        'src/main/structure/**/*.ts',
        'src/main/ai/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/index.ts',
        'src/shared/types/**',
        'src/main/ai/providers/**',
      ],
    },
  },
});
