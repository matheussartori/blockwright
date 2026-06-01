# Blockwright

Electron desktop app that renders Minecraft `.nbt` structure files in 3D. Long-term
goal: also AI-generate structures. Built with Electron Forge + Vite + TypeScript +
Three.js. Block models/textures come from an extracted Minecraft "content pack" on disk.

## Commands

- `npm start` — run the app in dev (Vite dev server + Electron, with HMR).
- `npm run lint` — ESLint (typescript-eslint). There is no separate typecheck script.
- `npm run package` / `npm run make` — build/package via Electron Forge.

## Architecture

Three Vite bundles, one per Electron context. Keep the process boundary strict:
**no Node/`fs`/`electron` imports in the renderer** — everything crosses via IPC.

```
src/
  main.ts                 Main entry: app lifecycle, open-file, scheme/protocol/IPC wiring
  preload.ts              Exposes window.blockwright (contextBridge) — the only renderer→main bridge
  main/
    window.ts             BrowserWindow creation, open dialog, pending-open queue, BW_CAPTURE
    ipc.ts                ipcMain.handle registrations for IPC_CHANNELS
    app-menu.ts           Native application menu (OS menu bar): File ▸ Open / Open Recent / Workspace
    recents.ts            Persisted "recently opened" files (last 10) in userData
    recent-workspaces.ts  Persisted "recently opened" mod workspaces (last 10) in userData
    workspace.ts          Mod-workspace detect/apply (+ detect-from-.nbt, activate a known one)
    texture-protocol.ts   Custom bw-texture:// privileged scheme serving namespaced PNGs
    structure/
      load-structure.ts   Parse .nbt (prismarine-nbt) → StructureData
      content-pack.ts      Namespace-aware asset roots (vanilla pack + workspace) + JSON cache
      blockstate-resolver.ts / model-loader.ts  block name+props → resolved models
      block-entity.ts      Chests (normal/trapped/ender + modded): synthesize entity-atlas geometry
      fallback-color.ts    Deterministic per-block color when textures are missing
      jigsaw.ts            Extract jigsaw connectors from a structure's block-entity NBT
      template-pool.ts     Resolve worldgen template pools + structure templates (namespace-aware)
      jigsaw-assembler.ts  Plan a (seeded, bounded) jigsaw assembly + validate connectors
    mc-version-detect.ts   Detect a mod's target Minecraft version from its project files
  renderer/
    index.ts              Renderer entry: mountShell → Viewer → App
    app.ts                Orchestration: open/load flow, wiring
    jigsaw.ts             Jigsaw panel controller: drives assembly/manual modes + warnings
    ui/shell.ts           Static chrome (titlebar/stage/statusbar) → typed element refs
    ui/inspector.ts, statusbar.ts, html.ts, version-select.ts
    viewer/               Three.js viewer + mesh/geometry/texture building (renders placed pieces)
  shared/
    ipc.ts                Single source of truth for IPC channel/event names
    types.ts              Type-only contracts shared by both bundles (incl. BlockwrightApi)
    jigsaw.ts             Pure jigsaw geometry/alignment (rotation, attachment, AABB, seeded RNG)
    mc-version.ts         Parse/normalize MC versions + the supported-for-jigsaw predicate
content/                  Extracted Minecraft content pack (assets/minecraft/...). Shipped as extraResource.
```

### IPC pattern

`shared/ipc.ts` holds all channel/event name constants — never inline channel strings.
`IPC_CHANNELS` = request/response (`ipcRenderer.invoke` ↔ `ipcMain.handle`);
`IPC_EVENTS` = fire-and-forget pushes from main → renderer (e.g. `open-path`).
When adding a feature that crosses the boundary: add the channel in `shared/ipc.ts`,
the handler in `main/ipc.ts`, the method on `BlockwrightApi` in `shared/types.ts`, and
the binding in `preload.ts`.

### Content pack & namespaces

`content-pack.ts` locates the base pack via `BW_CONTENT` env override → packaged
`resourcesPath/content` → repo `content/`. Asset resolution is **namespace-aware**: refs are
`namespace:path` (default `minecraft`), and each namespace resolves under its own root — the
vanilla pack for `minecraft`, the active **mod workspace** for its own namespace. So a mod block
model with `parent: minecraft:block/cube_all` + `theplacebeyond:block/foo` textures resolves the
parent from the vanilla pack and the texture from the workspace. Resolved texture keys are
`namespace/path` and are served only through `bw-texture://asset/<namespace>/<path>.png` (never
`file://`). Missing textures/models fall back to flat deterministic colors (`fallback-color.ts`).

### Mod workspace

"Open Mod Workspace…" (File menu or welcome button) picks a mod project folder; `workspace.ts`
locates its resources root (`src/main/resources` or the folder itself) and the non-`minecraft`
namespace under `assets/`, then `applyWorkspace` registers it as an extra asset source and clears
the JSON/model caches. A bottom-left badge shows the active workspace name. The mod's structures
(`data/<namespace>/structure/*.nbt`) then render with their custom textures, and are listed on the
welcome screen.

Opened workspaces are remembered in `recent-workspaces.ts` and surfaced both on the welcome screen
(next to recent files) and under File ▸ Open Recent Workspace. Opening a **loose** `.nbt` that sits
inside a mod (`<root>/data/<namespace>/structure/...nbt` with a matching `assets/<namespace>`) with
no workspace active triggers `detectWorkspaceForFile`, and the renderer shows a bottom-left prompt
offering to load that workspace; accepting activates it and re-renders the file so mod textures
resolve.

Each workspace also carries a **target Minecraft version** (`mc-version-detect.ts` reads it from
`fabric.mod.json` / `mods.toml` / `gradle.properties` / `pack.mcmeta`; if none is found the renderer
asks via `version-select.ts` and `setWorkspaceVersion` persists it). Loose vanilla files assume the
bundled pack's version.

### Jigsaw assembly

A jigsaw is a normal block (its `orientation` is a blockstate property) plus block-entity NBT
(`name`/`target`/`pool`/`final_state`/`joint`/priorities). `load-structure.ts` keeps that NBT — the
one place it isn't discarded — and `jigsaw.ts` turns it into `JigsawConnector[]` on `StructureData`.
`template-pool.ts` resolves a connector's `pool` (`data/<ns>/worldgen/template_pool/...`, namespace-
aware like assets; handles `single`/`legacy_single`/`list` elements) to candidate structure files.
`jigsaw-assembler.ts` plans an assembly: seeded + bounded recursion that follows each connector,
attaches a piece (front-to-front, matched by `target`↔`name`), rejects overlaps (AABB), and emits
validation warnings (missing/empty pools, dead connectors, depth limit). **All geometry is pure and
lives in `shared/jigsaw.ts`** so the planner (main) and the placement (renderer) share one rotation
convention: `quarterTurns` maps to `group.rotation.y = q·π/2` and `offset` to `group.position`, so a
plan's coordinates land exactly where the meshes go. Jigsaw features are gated to validated versions
via `isJigsawSupported`; unsupported versions show a notice instead. Pieces only resolve when the
relevant data is reachable (an active workspace, or the vanilla pack for `minecraft:` pools).

## Conventions / gotchas

- **Block entities (chests):** vanilla chests are particle-only blockstates rendered by a
  dedicated entity renderer, so `block-entity.ts` intercepts them in `resolveBlock` and
  synthesizes `ResolvedModel` boxes (bottom/lid/lock) with explicit box-UV into the 64×64
  `entity/chest/*` atlas. `facing` maps to a blockstate y-rotation; modded chests are detected
  by name and matched to an `entity/chest/...` texture in their own namespace (vanilla fallback).
- **Path alias:** `@/*` → `src/*` (see `tsconfig.json`). Use it for cross-dir imports.
- **Texture protocol CORS:** the `bw-texture://` scheme must be registered as privileged
  with `corsEnabled: true` *and* the handler must return an `access-control-allow-origin`
  header, or Three.js texture loads fail. Scheme registration happens at module load,
  before `app.ready`; the handler is wired after.
- **Forge entry naming:** keep `src/main.ts` and `src/preload.ts` at the top level —
  Forge names the output bundles by entry basename, and `main` in package.json points at
  `.vite/build/main.js`.
- **Renderer HTML safety:** UI is built by string templating into `innerHTML`; always run
  user/file-derived strings through `escapeHtml` (`renderer/ui/html.ts`).
- **Recents are owned by main:** `recents.ts` is the single source of truth. The native
  File menu and the renderer both mutate it via IPC; every mutation rebuilds the menu and
  broadcasts `recentsChanged`, which the welcome view re-renders from (don't keep a separate
  authoritative copy in the renderer).
- **macOS chrome:** the window uses `hiddenInset` titlebar + vibrancy; the titlebar is a
  custom drag region (`-webkit-app-region: drag`). Interactive elements inside it need
  `-webkit-app-region: no-drag`.

## Visual testing (no screen-recording permission needed)

The app can screenshot itself headlessly. Set env vars when launching:
- `BW_OPEN=/path/to/file.nbt` — open a file on startup.
- `BW_CAPTURE=/path/out.png` — render, write a PNG, then quit (~2.5s delay).
- `BW_CONTENT=/path/to/content` — override the content-pack location.
- `BW_WORKSPACE=/path/to/mod-project` — activate a mod workspace on startup.
