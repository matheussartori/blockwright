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
import { execFileSync } from 'node:child_process';

// macOS code signing, gated on env vars. Two tiers:
//   1. No Apple Developer cert (default): AD-HOC sign (identity '-'). This produces
//      a valid-but-anonymous signature — no cost, no account. It does NOT remove the
//      Gatekeeper warning, but it swaps the scary "app is damaged" error (which only
//      offers "Move to Trash") for the normal "unidentified developer" prompt, so a
//      user can open it via right-click ▸ Open. It's also required on Apple Silicon,
//      where every binary must carry at least an ad-hoc signature to run at all.
//   2. Real Developer ID cert + notarization: set these to ship a clean, no-warning
//      double-click install. Forge signs with the identity and notarizes via notarytool:
//        APPLE_SIGNING_IDENTITY   "Developer ID Application: Name (TEAMID)"
//        APPLE_ID, APPLE_PASSWORD (app-specific), APPLE_TEAM_ID
// Returns the partial packagerConfig to merge in.
type PackagerConfig = NonNullable<ForgeConfig['packagerConfig']>;
function macSigning(): Partial<Pick<PackagerConfig, 'osxSign' | 'osxNotarize'>> {
  const identity = process.env.APPLE_SIGNING_IDENTITY;
  const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env;
  // No real cert → ad-hoc sign so the package isn't flagged as "damaged". Two flags
  // are BOTH required for a working ad-hoc Apple Silicon build:
  //   • identityValidation:false — without it @electron/osx-sign treats '-' as a
  //     keychain identity NAME, runs `security find-identity` for it, finds nothing
  //     and throws "No identity found for signing", so the ad-hoc sign never runs and
  //     the app ships with only Electron's default linker signature (which the
  //     asar-integrity fuse then invalidates → SIGKILL "Code Signature Invalid").
  //   • hardenedRuntime:false (via optionsForFile) — osx-sign enables the hardened
  //     runtime by DEFAULT, which turns on Library Validation. Under an ad-hoc
  //     signature every nested binary has its own cdhash and no Team ID, so the main
  //     process refuses to load the (ad-hoc) Electron Framework: dyld aborts at launch
  //     with "have different Team IDs". Hardened runtime is useless without
  //     notarization anyway. NOTE: the top-level `hardenedRuntime` option is IGNORED by
  //     osx-sign — its per-file defaults hardcode `hardenedRuntime: true`, so the only
  //     way to turn it off for every binary is the `optionsForFile` callback.
  if (!identity) {
    return {
      osxSign: {
        identity: '-',
        identityValidation: false,
        optionsForFile: () => ({ hardenedRuntime: false }),
      },
    };
  }
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

/** Install the macOS 26 (Tahoe) "Liquid Glass" app icon into the freshly-copied .app, IF one
 *  has been compiled. macOS draws the legacy `.icns` (set via packagerConfig.icon) on a
 *  standardized tile and insets it; a proper Liquid Glass icon is a compiled `Assets.car` +
 *  `CFBundleIconName` in Info.plist. Forge/@electron/packager has no built-in support, so we
 *  drop it in here — BEFORE signing, so it's signed with the bundle.
 *
 *  This is a NO-OP unless `build/Assets.car` exists, so current builds are unaffected. To
 *  produce it (needs a Mac with Xcode 26+):
 *    1. Author `build/AppIcon.icon` in Icon Composer (import build/icon-master-fullbleed.png
 *       as the artwork — a single flat layer is fine; add glass layers for the full effect).
 *    2. Compile it:  xcrun actool build/AppIcon.icon --compile build \
 *                      --app-icon AppIcon --output-partial-info-plist /tmp/ai.plist \
 *                      --platform macosx --minimum-deployment-target 26.0
 *       (produces build/Assets.car). The `.icns` stays as the pre-Tahoe fallback.
 *  `buildPath` is the copied `…/<App>.app/Contents/Resources/app`, so Contents is two up. */
function installLiquidGlassIcon(buildPath: string, platform: string): void {
  if (platform !== 'darwin') return;
  const assetsCar = path.join(process.cwd(), 'build', 'Assets.car');
  if (!fs.existsSync(assetsCar)) return; // no Liquid Glass icon authored yet
  const contents = path.resolve(buildPath, '..', '..');
  const infoPlist = path.join(contents, 'Info.plist');
  if (!fs.existsSync(infoPlist)) return; // not a .app layout — bail safely
  fs.copyFileSync(assetsCar, path.join(contents, 'Resources', 'Assets.car'));
  // Point Info.plist at the icon in Assets.car (kept alongside CFBundleIconFile = the .icns).
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Add :CFBundleIconName string AppIcon', infoPlist]);
  } catch {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIconName AppIcon', infoPlist]);
  }
}

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
    // Install the macOS 26 Liquid Glass icon if one has been compiled (no-op otherwise).
    // Runs after copy, before signing, so the Assets.car is signed with the bundle.
    packageAfterCopy: async (_config, buildPath, _electronVersion, platform) => {
      installLiquidGlassIcon(buildPath, platform);
    },
  },
  packagerConfig: {
    // Lowercase binary name on Linux/Windows ONLY. The Linux deb/rpm makers
    // (electron-installer-*) derive the expected binary from the sanitized,
    // lowercased package name ("blockwright") but packager names the binary after
    // productName ("Blockwright") by default — so the deb maker can't find it and
    // fails ("could not find the Electron app binary at .../blockwright").
    //   We must NOT set it on macOS: packager passes executableName as the plist's
    //   CFBundleDisplayName (@electron/packager mac.js updatePlist), so a lowercase
    //   executableName makes Finder/Gatekeeper show "blockwright" instead of
    //   "Blockwright". Leaving it unset on darwin falls back to productName
    //   ("Blockwright") for the binary, the display name AND the .app bundle.
    ...(process.platform === 'darwin' ? {} : { executableName: 'blockwright' }),
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
    // Windows installer (Squirrel.Windows — the auto-update source update.electronjs.org
    // reads). Default Squirrel shows a generic borderless install splash with no app
    // branding, which looks sketchy. Brand it: our icon on the Setup.exe + the install
    // animation + the Add/Remove Programs entry. (The remaining SmartScreen "unknown
    // publisher" warning is unavoidable until the installer is code-signed with a
    // Windows cert — there's no free equivalent of macOS ad-hoc signing here.)
    new MakerSquirrel({
      setupIcon: './build/icon.ico',
      loadingGif: './build/install-spinner.gif',
      // Icon shown in Add/Remove Programs — Squirrel requires a URL, not a path, so
      // point at the committed icon on the public repo.
      iconUrl: 'https://raw.githubusercontent.com/matheussartori/blockwright/main/build/icon.ico',
      setupExe: 'Blockwright-Setup.exe',
    }),
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
