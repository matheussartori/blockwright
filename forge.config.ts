import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerFlatpak } from '@electron-forge/maker-flatpak';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'node:fs';
import os from 'node:os';
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

// Flathub's repo description — where the freedesktop Platform + Electron BaseApp
// runtimes live. Embedded into the .flatpak so installs can resolve them.
const FLATHUB_REPO = 'https://flathub.org/repo/flathub.flatpakrepo';

/** Whether a CLI is callable (used to make the runtime-repo step a no-op off Linux). */
function hasBinary(bin: string): boolean {
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Re-bundle a `.flatpak` with Flathub embedded as its `runtime-repo`.
 *
 *  THE "easy install" FIX. A single-file bundle ships the app but NOT its runtime;
 *  `flatpak install app.flatpak` must fetch org.freedesktop.Platform//24.08 from a
 *  remote. Without a hint the user gets "...Platform/<arch>/24.08 which was not found"
 *  unless they've already added Flathub AND installed the runtime in the right scope.
 *  `flatpak build-bundle --runtime-repo=<flathub>` stamps the bundle with where its
 *  deps live, so `flatpak install app.flatpak` offers to add Flathub and pulls the
 *  runtime automatically — one command, no prep.
 *
 *  The Forge maker (electron-installer-flatpak) exposes no way to pass this through to
 *  build-bundle, so we re-roll the finished artifact: import it into a throwaway OSTree
 *  repo, then re-export WITH the flag. Filename is `<id>_<branch>_<arch>.flatpak`. */
function embedRuntimeRepo(artifact: string): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-flatpak-repo-'));
  try {
    // Filename is `<id>_<branch>_<arch>.flatpak`, but the arch CAN contain an underscore
    // (`x86_64`), so splitting the whole basename on '_' mis-parses it (arch→`64`,
    // branch→`x86`). The arch is also the name of the artifact's parent directory
    // (out/make/flatpak/<arch>/), so take it from there, then peel branch off the rest.
    const arch = path.basename(path.dirname(artifact));
    const base = path.basename(artifact, '.flatpak');
    const stem = base.endsWith(`_${arch}`) ? base.slice(0, -(arch.length + 1)) : base;
    const sep = stem.lastIndexOf('_');
    const id = stem.slice(0, sep); // ids use '.'/'-', so the last '_' splits id from branch
    const branch = stem.slice(sep + 1);
    execFileSync('ostree', [`--repo=${repo}`, 'init', '--mode=archive-z2'], { stdio: 'inherit' });
    execFileSync('flatpak', ['build-import-bundle', repo, artifact], { stdio: 'inherit' });
    execFileSync(
      'flatpak',
      ['build-bundle', `--runtime-repo=${FLATHUB_REPO}`, '--arch', arch, repo, artifact, id, branch],
      { stdio: 'inherit' },
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
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
    // Stamp every produced .flatpak with Flathub as its runtime-repo so the runtime
    // auto-resolves on `flatpak install` (see embedRuntimeRepo). No-op when the
    // flatpak/ostree CLIs aren't present (e.g. a non-Linux make), so it never breaks
    // the other makers' output.
    postMake: async (_config, makeResults) => {
      if (hasBinary('flatpak') && hasBinary('ostree')) {
        for (const result of makeResults) {
          for (const artifact of result.artifacts) {
            if (!artifact.endsWith('.flatpak')) continue;
            try {
              embedRuntimeRepo(artifact);
            } catch (err) {
              console.warn(`[flatpak] could not embed runtime-repo into ${artifact}:`, err);
            }
          }
        }
      }
      return makeResults;
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
    // App icon (the squircle tile). Forge/packager appends the platform extension:
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
    // Linux Flatpak. CRITICAL: pin a CURRENT runtime/base version. For a modern
    // Electron the underlying @malept/electron-installer-flatpak takes its
    // "needs the zypak sandbox wrapper" path, which hardcodes the ancient
    // runtimeVersion '19.08' (installer.js) — that freedesktop runtime no longer
    // exists on Flathub, so `flatpak install app.flatpak` fails with
    //   "requires the runtime org.freedesktop.Platform/<arch>/19.08 which was not found".
    // Pinning 24.08 (a current, broadly-mirrored freedesktop runtime that supports
    // x86_64 AND aarch64) fixes that — with the Flathub remote added, the runtime
    // auto-installs alongside the bundle. base-version MUST match the runtime version
    // (org.electronjs.Electron2.BaseApp ships a matching 24.08 branch).
    new MakerFlatpak({
      options: {
        // Collision-free reverse-DNS app id for a GitHub-hosted app (was the
        // generated, ambiguous `com.github.blockwright`). Names the desktop file +
        // installed icon, and is the id users `flatpak run`.
        id: 'io.github.matheussartori.Blockwright',
        productName: 'Blockwright',
        genericName: 'Minecraft Structure Viewer',
        description: 'View, browse, and AI-generate Minecraft .nbt structures in 3D.',
        categories: ['Graphics', 'Utility'],
        // Pin a current runtime so the bundle's dependencies actually resolve.
        runtime: 'org.freedesktop.Platform',
        runtimeVersion: '24.08',
        base: 'org.electronjs.Electron2.BaseApp',
        baseVersion: '24.08',
        // The 1024² app icon (the squircle tile); the maker installs it under the id above.
        icon: './build/icon.png',
        // No extra files to copy into the bundle beyond what @electron/packager
        // produces (the type requires this field; [] is the default).
        files: [],
        // Skip building the zypak sandbox wrapper FROM SOURCE. By default the
        // installer injects a `zypak` git module compiled with clang++ during
        // flatpak-builder — but the freedesktop SDK sandbox has no clang, so it
        // dies with "make: clang++: No such file or directory" (Error 127).
        // org.electronjs.Electron2.BaseApp//24.08 ALREADY ships zypak-wrapper in
        // /app/bin, and the installer's generated `electron-wrapper` just calls it,
        // so the source build is redundant. Empty modules = use the BaseApp's zypak.
        modules: [],
        finishArgs: [
          // Display (Wayland with an X11 fallback) + GPU for the WebGL/Three.js viewer
          '--socket=wayland',
          '--socket=fallback-x11',
          '--share=ipc',
          '--device=dri',
          // Audio
          '--socket=pulseaudio',
          // AI generation + the GitHub-release update check
          '--share=network',
          // Open .nbt/.schem/.litematic files, content packs and mod workspaces from
          // anywhere the user picks (Electron's own dialogs, not portals, read the file)
          '--filesystem=host',
          // Chromium keeps its singleton socket in TMPDIR
          '--env=TMPDIR=/var/tmp',
          // Native desktop notifications via libnotify
          '--talk-name=org.freedesktop.Notifications',
        ],
      },
    }),
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
