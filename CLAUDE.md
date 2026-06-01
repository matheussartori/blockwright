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
      block-entity/        Blocks vanilla draws with an entity renderer (particle-only model),
                           synthesized from a 64×64 atlas: box-uv.ts (shared box/UV helper),
                           chest.ts, bed.ts, banner.ts (wall), index.ts (dispatcher)
      fluid.ts             Water/lava: full-cube from the animated "still" strip (water blue-tinted)
      fallback-color.ts    Deterministic per-block color when textures are missing
      jigsaw.ts            Extract jigsaw connectors from a structure's block-entity NBT
      template-pool.ts     Resolve worldgen template pools + structure templates (namespace-aware)
      jigsaw-assembler.ts  Plan a (seeded, bounded) jigsaw assembly + validate connectors
    mc-version-detect.ts   Detect a mod's target Minecraft version from its project files
  renderer/                React app (Vite + @vitejs/plugin-react). No Node/fs/electron — IPC only.
    index.tsx             Entry: createRoot(#app).render(<App/>) (no StrictMode — see gotchas)
    App.tsx               Orchestration: layout, open/load/close flow, IPC wiring, window→menu reporting
    api.ts                Typed accessor for window.blockwright (the preload bridge)
    components/           FloatingWindow (shared window chrome), Titlebar, Statusbar, Welcome,
                          WorkspaceBadge/Suggest, Loading, SettingsModal, VersionSelectModal
    windows/              ControlsWindow / InspectorWindow / JigsawWindow — the three floating windows
    hooks/useStores.ts    useApp / useSettings / useWindows (React bindings over the vanilla stores)
    state/                store.ts (main-mirrored + view state), settings.ts (prefs),
                          windows.ts (floating-window layout, persisted)
    ui/path.ts            basename/dirname helpers (no Node path across the bridge)
    viewer/               Three.js Viewer + ViewerProvider (React bridge) + mesh/geometry/texture building
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

- **Synthesized blocks (entities + fluids):** some blocks have a particle-only blockstate
  model because vanilla draws them with a dedicated renderer. `resolveBlock` intercepts them
  before the normal model path: `fluid.ts` (water/lava) and the `block-entity/` dispatcher
  (chest/bed/banner). Each builds `ResolvedModel`s directly. **Add a new kind as its own file**
  in `block-entity/` and wire it into `block-entity/index.ts` — don't lump them together.
  - Entity geometry uses `box-uv.ts`: `boxFaces` is the standard Minecraft box-UV unwrap
    (front lands on +z/south) into a 64×64 atlas; `FACING_Y` maps `facing` to a y-rotation
    (base front = +z). Chests = bottom/lid/lock; beds = mattress slab + 2 legs per half
    (`part=head|foot`, pillow/blanket/cap regions hardcoded from the atlas, see `bed.ts`);
    wall banners = a tinted cloth panel from `entity/banner_base` (dye color per `<color>_wall_banner`).
  - Fluids render a full cube from the animated "still" strip; the renderer auto-detects the
    vertical strip and samples its first frame, so a plain 0..16 UV is correct.
  - **Tinting:** grayscale textures (water's still, the white banner cloth) are colored via
    `ModelFace.tint` (explicit sRGB `[r,g,b]`), which the renderer multiplies in; it takes
    precedence over the grass-green `tintindex` path. Lava/chests/bed textures are already colored.
- **Path alias:** `@/*` → `src/*` (see `tsconfig.json`). Use it for cross-dir imports.
- **Texture protocol CORS:** the `bw-texture://` scheme must be registered as privileged
  with `corsEnabled: true` *and* the handler must return an `access-control-allow-origin`
  header, or Three.js texture loads fail. Scheme registration happens at module load,
  before `app.ready`; the handler is wired after.
- **Forge entry naming:** keep `src/main.ts` and `src/preload.ts` at the top level —
  Forge names the output bundles by entry basename, and `main` in package.json points at
  `.vite/build/main.js`.
- **Floating windows:** Controls / Inspector / Jigsaw share one chrome (`components/FloatingWindow.tsx`):
  titled, draggable (clamped to the stage), minimize-only. Layout lives in `state/windows.ts`
  (persisted). The native **View** menu shows/hides each window and offers Layout ▸ Reset Window
  Positions; `App.tsx` reports `{visible,available}` per window to main (`reportWindows`) so the
  menu's checkmarks/enabled state track the renderer (which owns the state). Don't inline window
  positions — go through the store.
- **Renderer is React:** UI is JSX (React escapes interpolated strings, so there's no `escapeHtml`).
  The Viewer is imperative Three.js bridged via `viewer/ViewerProvider.tsx`; it's created once and
  has no teardown, which is why `index.tsx` does **not** use StrictMode.
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
- `BW_CAPTURE=/path/out.png` — render, write a PNG, then quit (~2.5s delay). On a cold
  dev start (Vite re-optimizing deps) 2.5s can capture a blank page; bump it with
  `BW_CAPTURE_DELAY=8000` (ms).
- `BW_CONTENT=/path/to/content` — override the content-pack location.
- `BW_WORKSPACE=/path/to/mod-project` — activate a mod workspace on startup.
