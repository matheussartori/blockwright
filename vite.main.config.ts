import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import path from 'node:path';

// Node builtins + electron must stay external in the main bundle. The Claude
// Agent SDK (and zod, which it uses for tool schemas) are also externalized: the
// SDK spawns a bundled native `claude` binary and resolves files relative to its
// own module path, so it must be loaded from node_modules at runtime, not inlined
// into the Vite bundle. generate.ts imports both via dynamic `import()`.
const external = [
  'electron',
  'electron/main',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  '@anthropic-ai/claude-agent-sdk',
  'zod',
];

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    rollupOptions: { external },
  },
});
