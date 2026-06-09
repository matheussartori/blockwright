import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'node:fs';
import path from 'node:path';

// The AI SDKs are externalized from the Vite main bundle (see vite.main.config.ts)
// and loaded via dynamic import() at runtime, so they must exist in the packaged
// app's node_modules. But the Vite plugin's prune strips node_modules entirely,
// dropping them — and the native binaries the Agent/Codex SDKs spawn. This list +
// the `packageAfterPrune` hook below re-copy just those packages (plus their full
// runtime dependency closure) back into the package, so the dynamic imports resolve
// and the `asar.unpack` glob can extract the native binaries.
const RUNTIME_PACKAGES = [
  '@anthropic-ai/claude-agent-sdk',
  '@openai/codex-sdk',
  'zod',
];

/** A package's runtime dependency names (deps + optionalDeps) from its manifest. */
function dependencyNames(pkgDir: string): string[] {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    return [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {})];
  } catch {
    return [];
  }
}

/** Copy `packages` and their transitive runtime dependency closure from `fromRoot`'s
 *  node_modules into `appRoot`'s node_modules, skipping anything already present or
 *  not installed for this platform (optional native deps). */
function copyDependencyClosure(packages: string[], fromRoot: string, appRoot: string): void {
  const queue = [...packages];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    const src = path.join(fromRoot, 'node_modules', name);
    if (!fs.existsSync(src)) continue; // optional/platform dep not installed here
    const dest = path.join(appRoot, 'node_modules', name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, dereference: true });
    queue.push(...dependencyNames(src));
  }
}

const config: ForgeConfig = {
  hooks: {
    // Re-instate the externalized runtime SDKs that prune removed (see the note above
    // RUNTIME_PACKAGES). Runs after prune, before the asar is built, so the copied
    // packages land in the asar and the `asar.unpack` glob extracts their binaries.
    packageAfterPrune: async (_config, buildPath) => {
      copyDependencyClosure(RUNTIME_PACKAGES, process.cwd(), buildPath);
    },
  },
  packagerConfig: {
    // App icon (logo-dark). Forge/packager appends the platform extension:
    // build/icon.icns on macOS, build/icon.ico on Windows.
    icon: './build/icon',
    // Unpack the agentic SDKs and their platform-native binaries from the asar so
    // they can be spawned (an executable can't run from inside the archive): the
    // Claude Agent SDK's `claude` binary and the Codex SDK's `codex` binary (which
    // lives in the @openai/codex* native packages). The driver modules load these
    // at runtime from node_modules.
    asar: {
      unpack:
        '**/node_modules/{@anthropic-ai/claude-agent-sdk,@anthropic-ai/claude-agent-sdk-*,@openai/codex-sdk,@openai/codex,@openai/codex-*}/**',
    },
    // Ship the Minecraft content pack and the AI knowledge base alongside the
    // app (both resolved at runtime).
    extraResource: ['content', 'knowledge'],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
