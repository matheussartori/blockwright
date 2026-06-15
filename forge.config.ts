import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'node:fs';
import path from 'node:path';

// macOS code signing + notarization, gated entirely on env vars so the app ships
// UNSIGNED by default (no Apple Developer cert yet). Set these in CI/locally to
// activate it — Forge then signs with the identity and notarizes via notarytool:
//   APPLE_SIGNING_IDENTITY   "Developer ID Application: Name (TEAMID)"
//   APPLE_ID, APPLE_PASSWORD (app-specific), APPLE_TEAM_ID
// Returns the partial packagerConfig to merge in (empty when unset).
type PackagerConfig = NonNullable<ForgeConfig['packagerConfig']>;
function macSigning(): Partial<Pick<PackagerConfig, 'osxSign' | 'osxNotarize'>> {
  const identity = process.env.APPLE_SIGNING_IDENTITY;
  const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!identity) return {};
  return {
    osxSign: { identity },
    ...(APPLE_ID && APPLE_PASSWORD && APPLE_TEAM_ID
      ? { osxNotarize: { appleId: APPLE_ID, appleIdPassword: APPLE_PASSWORD, teamId: APPLE_TEAM_ID } }
      : {}),
  };
}

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
    // Lowercase binary name. The Linux deb/rpm makers (electron-installer-*)
    // derive the expected binary from the sanitized, lowercased package name
    // ("blockwright") but packager names the binary after productName
    // ("Blockwright") by default — so the deb maker can't find it and fails
    // ("could not find the Electron app binary at .../blockwright"). Pinning
    // executableName makes the binary lowercase on every platform; the macOS
    // .app bundle + Windows installer are still named via productName.
    executableName: 'blockwright',
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
    // Ship only the AI knowledge base (our own content). The Minecraft content
    // pack is NOT bundled — redistributing Mojang's assets isn't permitted — so
    // the user points Blockwright at their own extraction at runtime (see
    // structure/assets/content-dir.ts).
    extraResource: ['knowledge'],
    // Off unless the APPLE_* env vars are set (see macSigning); unsigned otherwise.
    ...macSigning(),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    // ZIP for macOS is required for Squirrel.Mac auto-update (update.electronjs.org
    // serves the .zip); the DMG is the human-friendly installer.
    new MakerZIP({}, ['darwin']),
    new MakerDMG({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    // Publish makers to GitHub Releases (the free, server-less update source that
    // update.electronjs.org reads). `npm run publish` on a tag uploads here; needs
    // a GITHUB_TOKEN with repo scope in the environment (CI provides it).
    new PublisherGithub({
      repository: { owner: 'matheussartori', name: 'blockwright' },
      // Created as a draft so you review before publishing; the body is auto-filled
      // from the commits/PRs since the last tag (GitHub's native generator), so you
      // don't hand-write release notes — just tweak and hit Publish.
      draft: true,
      generateReleaseNotes: true,
    }),
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
