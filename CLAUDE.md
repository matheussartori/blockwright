# Blockwright

Electron desktop app that renders Minecraft structures (`.nbt`/`.schem`/`.litematic`) and whole
world saves in 3D, edits them, AI-generates new ones, and exports them into mod workspaces /
datapacks. Electron Forge + Vite + TypeScript + React + Three.js. Block models/textures come from
a user-supplied Minecraft "content pack" on disk (never bundled — Mojang assets).

**Deep-dive docs: `docs/architecture.md`** — read the relevant section BEFORE non-trivial work on a
subsystem (AI generation loop, world viewer/editor + safe write path, jigsaw split, export/worldgen,
block editor, domain modules/seeded archetypes, versions, updates, theming/icons).

## Commands

- `npm start` — dev (Vite dev server + Electron, HMR)
- `npm run lint` / `npm run typecheck`
- `npm run test` — Vitest (suites in `__tests__/` dirs); `npm run test:watch`
- `npm run package` / `npm run make` — Electron Forge

## Architecture map

Three Vite bundles, one per Electron context. **Strict process boundary: no Node/`fs`/`electron`
imports in the renderer** — everything crosses via IPC.

```
src/
  main.ts / preload.ts    Entries — keep at top level (Forge names bundles by entry basename);
                          preload exposes window.blockwright, the ONLY renderer→main bridge
  main/
    window.ts ipc.ts app-menu.ts logger.ts   Window/IPC handlers/native menu/console mirror
    updater.ts update-check.ts               Squirrel auto-install + notify-only GitHub check
    recents.ts recent-workspaces.ts pinned-workspace.ts  Persisted userData records (main OWNS recents)
    workspace.ts mc-version-detect.ts        Mod-workspace detect/apply/list + target MC version
    texture-protocol.ts                      bw-texture:// privileged scheme (namespaced PNGs)
    file-watch.ts                            Hot-reload the open file + workspace structure folder
    export/                 Workspace export (planExport/runExport), Export As, Export to World,
                            worldgen JSON builders, writeSplitFiles, doctor.ts (workspace check-up),
                            worldgen-studio.ts (Worldgen Studio: read + surgical write of the 4 JSONs)
    structure/
      io/                   RawStructure codecs: .nbt / .schem / .litematic, long-bits (BigInt bit
                            packing), convert, splitToJigsaw (oversized → jigsaw), data-markers
      assets/               Content-pack roots, blockstate/model resolution, fluids, synthesized
                            block-entity models, entity.ts (armor stand + vanilla-mob render layers,
                            NBT texture variants), block-dictionary (mod-block annotations)
      catalog/              Block catalog, previewBlock, retheme-map, module-preview
      jigsaw/               Connectors, template pools, seeded assembler (geometry in shared/jigsaw.ts),
                            pool-info.ts (Jigsaw Lab pool inspector); assembler emits validator warnings
      lint.ts               Per-file structure linter (air-vs-void, out-of-range blocks, orphan
                            palette, data markers) — standalone panel + re-reported by the Doctor
      domain/               Composable generation: modules by category (structure/decoration/roof/
                            basement/attic/room/surroundings), composeStructure crosses them, seeded
                            archetype shells, registries. Contract test-enforced — see docs.
      authoring/            Authoring JSON → gzipped .nbt: volumetric ops, passes/ (preserveShell,
                            rebuildStairwells, connectBlocks, fixDoors, fixPlacement, fillInteriorAir
                            + per-structure finalizers), compile.ts
      mc-data-version.ts data-version.ts     DataVersion registry + active-target stamping
    ai/                     Provider-agnostic generation: generate.ts (orchestrator), emit-handler
                            (validate→compile→render→review + collapse gate), providers/ (claude-sdk,
                            codex), knowledge.ts (tiered guides), session/output-dir/save-version
    world/                  World read + edit: world-source (lazy LRU Anvil reader), chunk-resolve,
                            world-service / edit-service, anvil/ (region/chunk codecs), edit/ (the
                            SAFE WRITE path: session lock → surgical patch → enforced backup →
                            atomic region rewrite → POI invalidation; refused chunks reported)
  renderer/                 React app — IPC only.
    App.tsx + app/          Workbench layout + per-concern hooks (useDocumentFlow/useAppIpc/…)
    components/             ActivityBar/ProjectPanel/TabBar/Statusbar/Welcome, generate/ (planner +
                            chat), export/, editor/ (block editor UI), world-edit/, settings/,
                            ui/ primitives (Modal/Select/Tooltip/Segmented/StructurePreview…) —
                            build dialogs from ui/; prefer Select over native <select>, Tooltip over title=
    generation/             Pure brief/details/floors helpers (unit-tested)
    editor/ops.ts           Pure block-editing ops (move/extrude/mirror/rotate/paint/void…, tested)
    diff/                   Pure structure diff
    state/                  Vanilla stores: store/settings/documents/generation/versions/editor/
                            windows/logs/theme/i18n/planner/world-edit (+ hooks/useStores.ts)
    viewer/                 Imperative Three.js Viewer + overlays + capture; geometry-core.ts is the
                            WORKER-SAFE geometry math shared with the world mesh worker (golden test)
    world/                  Streamed world scene: world-view, worker-pool, LOD, surface, HUD
                            components/, edit-overlay.ts (pending-edit compositor)
  shared/
    ipc.ts types/           ALL channel/event names + type-only contracts (BlockwrightApi)
    jigsaw.ts mc-version.ts Pure geometry / version math
    entity-models.ts        GENERATED vanilla mob box models (build/gen-entity-models.mjs) +
    entity-registry.ts      hand-curated mob id → render layers/textures (contract test-enforced)
    domain/                 Pure predicates used by BOTH processes (applies-to, module-slots,
                            storeys, furnishing, worldgen, split, surroundings) — no drift
    i18n/                   en.ts + pt-BR.ts + registry-data overrides (data-pt-BR.ts)
content/                    Optional local vanilla content pack (dev auto-pickup; never shipped)
knowledge/                  Model-facing guides (core + per-module) for AI generation
```

## IPC pattern

Never inline channel strings — `shared/ipc.ts` is the single source (`IPC_CHANNELS` =
invoke/handle, `IPC_EVENTS` = main→renderer push). A new cross-boundary feature is 4 edits:
channel in `shared/ipc.ts` → handler in `main/ipc.ts` → method on `BlockwrightApi`
(`shared/types/api.ts`) → binding in `preload.ts`.

## i18n

- Every user-facing string goes in `shared/i18n/en.ts` AND `pt-BR.ts` (typed complete — missing key
  won't compile); `t('key')` in renderer (`useT()`), `mt('key')` in main.
- Registry DATA (domain modules/params/presets, AI provider lists) is authored inline in English;
  add the pt-BR override in `shared/i18n/data-pt-BR.ts`. The coverage test fails any missing or
  untranslated entry.

## Conventions / gotchas

- Path alias `@/*` → `src/*`.
- `bw-texture://` must stay privileged with `corsEnabled: true` AND the handler must return
  `access-control-allow-origin`, or Three.js texture loads fail.
- No React StrictMode (`index.tsx`) — the Viewer is imperative, created once, no teardown.
- Theming: components use CSS var tokens (`--bg`, `--panel`, `--accent`…), never hardcoded colors.
  A theme lives in BOTH `renderer/state/themes.ts` and an `index.css` `[data-theme]` block (+ its
  i18n label). `nativeTheme.themeSource` must track a forced theme. `--mono` for numeric data.
- Recents/pinned workspace are owned by main; renderer mutates via IPC and re-renders from events —
  never keep an authoritative copy renderer-side.
- AI SDKs (+ zod) are externalized from the Vite main bundle and loaded via dynamic `import()` in
  each `providers/` driver; asar-unpacked in `forge.config.ts` (they spawn native binaries).
  Pass `createSdkMcpServer(...)` DIRECTLY as the `mcpServers` value — never wrap `{type:'sdk'}`.
- Air/void semantics: `minecraft:air` CLEARS the cell on paste; `structure_void` and OMITTED cells
  leave the world untouched (void ≡ omitted).
- A loaded model with no `elements` renders NOTHING on purpose (tall-block convention) — only a
  MISSING model file gets the fallback-color cube.
- `.litematic` block arrays use the SPANNING bit-pack scheme; `.schem` is an unsigned-varint palette
  stream — both directions live in `structure/io/long-bits.ts` / `schematic.ts` (test-enforced).
- Structure blocks load ≤48 blocks/axis (32 pre-1.16): every export path auto-splits oversized
  builds into a jigsaw assembly. 1.21 jigsaw defs REQUIRE `spawn_overrides` (even `{}`);
  `max_distance_from_center` ≤ 116 (both test-enforced).
- World edit safe-write invariants (`main/world/edit/`) are non-negotiable: session lock, enforced
  region-granular backup, surgical tag patch (never re-serialize from the render model), atomic
  region rewrite, strip light + delete Heightmaps (game recomputes), POI `Valid: 0`, refuse — never
  best-effort — a chunk that fails the gate. DataVersion is preserved, never bumped.
- JSDoc: functions with ≥4 positional params or non-trivial branching carry `@param`/`@returns`;
  options-object functions document fields on the interface. Prefer options objects.
- Icons: lucide-react (named imports). macOS window is `hiddenInset`; TabBar is the single top
  bar/drag region (`TITLEBAR_H` sync). App icon assets regenerate via `python3 build/make-icons.py`.

## Visual testing (headless, no screen-recording permission)

Env vars at launch: `BW_OPEN=<file.nbt>` open file · `BW_CAPTURE=<out.png>` render, screenshot,
quit (`BW_CAPTURE_DELAY=8000` on cold dev starts) · `BW_CONTENT=<dir>` content pack ·
`BW_WORKSPACE=<dir>` activate workspace · `BW_OPEN_WORLD=<save>` open world ·
`BW_WORLD_CAM=x,y,z` / `BW_WORLD_LOOK=x,y,z` aim the world camera ·
`BW_OPEN_SETTINGS=<tab>` open Settings on a tab (appearance/viewer/world/ai/library/about).
