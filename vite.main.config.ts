import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import path from 'node:path';

// Node builtins + electron must stay external in the main bundle. The two AI provider
// SDKs are externalized too and loaded via dynamic `import()` in the driver modules
// (src/main/ai/providers/): the Claude Agent SDK and Codex SDK each spawn a bundled
// native binary resolved relative to their own module path, so they must run from
// node_modules, not inlined. `zod` is external so the Agent SDK's `tool()` gets
// schemas from the same instance.
const external = [
  'electron',
  'electron/main',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  '@anthropic-ai/claude-agent-sdk',
  '@openai/codex-sdk',
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
