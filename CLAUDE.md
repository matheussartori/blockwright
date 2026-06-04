# Blockwright

Electron desktop app that renders Minecraft `.nbt` structure files in 3D. Long-term
goal: also AI-generate structures. Built with Electron Forge + Vite + TypeScript +
Three.js. Block models/textures come from an extracted Minecraft "content pack" on disk.

## Commands

- `npm start` — run the app in dev (Vite dev server + Electron, with HMR).
- `npm run lint` — ESLint (typescript-eslint).
- `npm run typecheck` — `tsc --noEmit` (no emit, type-only check).
- `npm run test` — Vitest (the unit suites under `__tests__/` dirs); `npm run test:watch` to watch.
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
    structure/              Grouped by responsibility (one subdir per concern):
      io/
        load-structure.ts   Parse .nbt (prismarine-nbt) → StructureData
      assets/               The resource/model layer (block name+props → resolved models + textures):
        content-pack.ts      Namespace-aware asset roots (vanilla pack + workspace) + JSON cache
        blockstate-resolver.ts / model-loader.ts  block name+props → resolved models
        variant-match.ts     Pick the best blockstate variant for a block's props
        fluid.ts             Water/lava: full-cube from the animated "still" strip (water blue-tinted)
        fallback-color.ts    Deterministic per-block color when textures are missing
        block-entity/        Blocks vanilla draws with an entity renderer (particle-only model),
                             synthesized from a 64×64 atlas: box-uv.ts (shared box/UV helper),
                             chest.ts, bed.ts, banner.ts (wall), index.ts (dispatcher)
      catalog/
        block-catalog.ts     Enumerate placeable blocks (vanilla pack + active workspace namespace,
                             namespace-aware) + a representative texture per block → the Block Catalog.
                             `previewBlock(id)` resolves one block into a 1×1×1 StructureData for the
                             catalog's live 3D preview (renderer reuses buildStructure on it).
      jigsaw/
        jigsaw.ts            Extract jigsaw connectors from a structure's block-entity NBT
        template-pool.ts     Resolve worldgen template pools + structure templates (namespace-aware)
        jigsaw-assembler.ts  Plan a (seeded, bounded) jigsaw assembly + validate connectors
      domain/              Composable generation: STRUCTURE TYPES × DECORATION THEMES, expanded by
                           the `template` op in the authoring compiler (the model emits one op, the
                           code produces the geometry). See "Composable generation domain" below.
        roles.ts           Semantic block roles (wall/floor/roof/…) + BASE_BLOCKS fallback + isRole
        params.ts          ParamSpec/ParamDef + resolveParams (single per-type param declaration)
        compose.ts         composeStructure (THE cross) + composeBlockNames + isKnownStructure +
                           name aliases (abandoned_house→house+abandoned, large_basement→basement+abandoned)
        structure-types/   One file per archetype (house, basement) + types.ts (contract + Box/logProps)
                           + index.ts (registry). A type emits ops in terms of roles; never names blocks.
        themes/            One file per look (abandoned, plain) + types.ts (contract) + index.ts (registry,
                           DEFAULT_THEME='abandoned'). A theme maps roles→blocks + decay + weathering.
        rng.ts             shared seeded PRNG (mulberry32/seed3)
        footprint.ts       seeded non-rectangular footprints (rect/L/T/U/plus) so a basement isn't always
                           a square box (param `shape`, default `auto`). Tests in domain/__tests__/.
    mc-version-detect.ts   Detect a mod's target Minecraft version from its project files
    ai/                     AI structure generation (File ▸ New Structure)
      generate.ts           Provider-agnostic orchestrator: owns sessions, the emit→compile→render→
                            review handler, round budget + progress; dispatches to a provider driver
      schema.ts             Shared system prompt + emit_structure schema (rich JSON Schema for
                            Anthropic/OpenAI; flat string-schema for Gemini/Codex)
      credentials.ts        Multi-provider credential store (per-provider secret via safeStorage) +
                            active-provider/model prefs + env precedence
      providers/            One Driver per backend (claude-sdk, anthropic, openai, gemini, codex) +
                            index.ts (lazy dispatch) + types.ts (the Driver contract)
      knowledge.ts          Load the knowledge/nbt guides as the generator's system prompt
                            (conditionally — `knowledge-select.ts` drops situational guides like
                            the tower playbook unless the prompt calls for them, to cut tokens)
    structure/authoring/    Validate + compile authoring JSON → gzipped .nbt (the JSON↔NBT
                          pipeline). Decomposed by responsibility, with a unit-test suite in
                          __tests__/ (run `npm run test`). Public API via the barrel `index.ts`.
      types.ts            AuthoringStructure/Op/PaletteEntry/Block/Entity (shared contracts)
      geometry.ts         pure integer geometry (posKey, inBounds, lineCells, cellsInBox, rotXZ)
      orientation.ts      directional-blockstate transforms for mirror/rotate (facing/axis/…)
      palette.ts          paletteKey, makeIntern (get-or-create dedup), isAir, bareId
      nbt-encode.ts/-decode.ts  tag-typed encode → gzipped .nbt; readAuthoring (.nbt → JSON)
      ops/                applyOp dispatcher + resolveBlocks; roof.ts/stairs.ts builders.
                          Expands volumetric `ops` (fill/hollow/walls/line/block) → block list
                          before NBT, so the model emits ~ops not ~1000s of blocks.
      passes/             Post-processing pipeline: each Pass is (blocks,palette,ctx)→
                          {blocks,palette,fixes?,warnings?}; runPasses chains them, accumulating
                          fixes/warnings. carveStairwells (open the shaft over a flight +
                          clear a standing landing in front of the bottom step),
                          connectBlocks (derive pane/bar/fence/wall sides from neighbours — the AI
                          omits north/south/east/west, so an isolated pane would render as the bare
                          `_post` column; splits palette per side combo), fillInteriorAir (clear
                          each column's interior without gouging terrain). NEW quality checks plug
                          in as a Pass here (e.g. the placement validator).
      compile.ts          compileStructure / compileStructureReport / writeStructureFile
                          (validate → resolveBlocks → runPasses → encode). writeStructureFile
                          returns a CompileReport ({fixes,warnings}) for the generator to surface.
  renderer/                React app (Vite + @vitejs/plugin-react). No Node/fs/electron — IPC only.
    index.tsx             Entry: initTheme() then createRoot(#app).render(<App/>) (no StrictMode — see gotchas)
    App.tsx               Orchestration: layout, open/load/close flow, IPC wiring, window→menu reporting
    api.ts                Typed accessor for window.blockwright (the preload bridge)
    components/           FloatingWindow (shared window chrome), Statusbar, Welcome (themed Logo + action
                          cards), TabBar (the single slim top bar — no separate titlebar), WorkspaceBadge/
                          Suggest, Loading, SettingsModal (tabbed), VersionSelectModal, CatalogModal
                          (Block Catalog: list/grid + 3D preview — store.catalogOpen)
    components/ui/        Reusable primitives: Modal (overlay+panel shell), Segmented (toggle), Logo
                          (themed <picture>), BlockPreview (standalone Three.js single-block render).
                          Build dialogs/controls from these so fonts/spacing/styles stay consistent.
    windows/              ControlsWindow / InspectorWindow / JigsawWindow — the three floating windows
    hooks/useStores.ts    useApp / useSettings / useWindows (React bindings over the vanilla stores)
    state/                store.ts (main-mirrored + view state), settings.ts (prefs, incl. theme),
                          windows.ts (floating-window layout, persisted), theme.ts (apply light/dark)
    ui/path.ts            basename/dirname helpers (no Node path across the bridge)
    viewer/               Three.js Viewer (scene/camera/navigation/loading) + ViewerProvider (React
                          bridge) + mesh/geometry/texture building. Focused concerns split out of the
                          Viewer class: capture.ts (the AI-review screenshot paths: orbit/cutaway/
                          section), floor-regions.ts (FloorRegionsOverlay — the floor-plan bands),
                          highlight.ts (FocusHighlight — the inspector focus box).
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

### Composable generation domain

`structure/domain/` is the data-driven model behind the authoring `template` op, built so
the two growth axes — **structure types** and **decoration themes** — combine without N×M
code. A **StructureType** (`house`, `basement`) owns only the *massing* (shell, openings,
structural detail) and emits ops in terms of **semantic roles** (`wall`, `floor`, `roof`…),
never concrete blocks. A **DecorationTheme** (`abandoned`, `plain`) owns the *look*: it maps
roles→blocks (sparsely), sets a decay level, and weathers blocks. `composeStructure` crosses
them: it resolves a role's block by **per-op override > theme.blocks > type.defaults >
BASE_BLOCKS**, resolves the type's params (`params.ts`, the single param declaration), and
calls `type.build(...)` against a theme-backed `RolePalette`. So any type works with any
theme, and a new type or theme is one small file.

- **The `template` op is unchanged** in the authoring schema: `op.name` is a structure-type
  id, `op.params.theme` picks the theme, and any param keyed by a role name is a block
  override. Compiled in `authoring/ops/index.ts` via `composeStructure`.
- **Behaviour preserved:** each type ships its own material `defaults` (a "kit"), so the
  `abandoned` theme is transparent (no block overrides — just decay + weathering) and
  `house`/`basement` + `abandoned` reproduce the old `abandoned_house`/`large_basement`
  output. The old names still resolve via aliases in `compose.ts`.
- **Add a structure type:** new file in `structure-types/`, register in its `index.ts`.
  **Add a theme:** new file in `themes/`, register in its `index.ts`. **Add a role:** extend
  `roles.ts` (`Role` + `ROLES` + `BASE_BLOCKS`).
- **Three consumers** (all via the `domain/` barrel): `authoring/ops/index.ts`
  (`composeStructure`), `authoring/validate.ts` (`isKnownStructure`/`knownStructureNames`),
  `ai/generate.ts` (`composeBlockNames` — the per-role override block ids it validates against
  the content pack). The model-facing guide is `knowledge/nbt/13-templates.md`.
- **Future:** `DecorationTheme.furnish()` is a defined-but-unused extension point for
  furniture/decoration ops (interiors still come from the AI + authoring passes today).

### AI structure generation

File ▸ New Structure opens a chat (`NewStructurePanel`) that generates `.nbt`s. Generation is
**provider-agnostic** (`src/main/ai/`): `generate.ts` owns everything backend-neutral — sessions, the
`emit_structure` handler that validates + compiles the authoring JSON (`structure/authoring/`) to a
versioned temp `.nbt`, the emit→render→**review** loop (screenshots fed back so the model refines
against the prompt/reference, not blind), the round budget, and the live token/phase progress — then
dispatches the LLM transport to a **provider driver** (`providers/`). The shared contract lives in
`providers/types.ts` (`Driver` + `onEmit` + `DriverProgress`); the shared system prompt + tool schema
live in `schema.ts`. Validation errors are returned to the model so it self-corrects in the same turn.

The user picks the **active provider** + model in Settings ▸ AI (`shared/ai.ts` = the registry: id,
label, auth kind, models). Supported backends:
- **claude-subscription** — the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`): authenticates
  like the Claude Code CLI, runs on the user's **Pro/Max plan** (no API credits). The SDK manages the
  conversation/tool dispatch/resume; the driver just registers `emit_structure`.
- **claude-api** — the raw Anthropic API (`@anthropic-ai/sdk`) with a pasted key; a manual tool loop
  with prompt caching on the (huge) system prompt.
- **openai** — OpenAI Chat Completions (`openai`); function calling + vision. `tool` messages are
  text-only, so the review screenshots come back as a follow-up `user` message.
- **gemini** — Gemini (`@google/genai`); function declarations can't express the free-form authoring
  maps, so `emit_structure` takes the structure as a **JSON string** (parsed in the driver); review
  images ride a follow-up user turn.
- **codex** — the Codex CLI (`@openai/codex-sdk`) on the **ChatGPT Plus/Pro** plan. No in-process
  tools: it uses **structured output** for the authoring JSON and takes review screenshots as
  `local_image` file paths. Best-effort.

Resumable providers (claude-subscription, codex — see `RESUMABLE_PROVIDERS`) continue their own
server/CLI conversation via a stored session id; the stateless API providers have no server memory,
so the orchestrator **re-seeds them each turn** with the latest emitted version's authoring JSON
(`buildSeed`) so follow-up edits stay coherent.

`credentials.ts` resolves auth per provider: env var(s) for that provider win and lock the field
in-app, else an in-app secret (encrypted via `safeStorage` in one blob), else (for subscription
providers) the existing CLI keychain login. Secrets never cross the IPC bridge — only a `configured?`
flag, a masked hint, and the chosen model (`getConfig` → `AiConfig`). `aiAvailable()` reflects the
active provider (subscription = optimistic, api-key = key present); a real auth failure surfaces as a
clear error on first send (see `authHint`). Old single-Claude credentials migrate on first read.

- **The AI SDKs are externalized from the Vite main bundle** (`vite.main.config.ts` `external`) and
  loaded via dynamic `import()` inside each `providers/` driver (so a provider's SDK only loads when
  used). The Claude Agent SDK and Codex SDK each spawn a bundled **native binary** resolved relative
  to their own module path, so they must not be inlined; the rest (`@anthropic-ai/sdk`, `openai`,
  `@google/genai`) stay external for the same load path. **zod** is external too so the Agent SDK's
  `tool()` gets schemas from the same instance. When packaging, those SDKs + their platform-native
  packages (`@anthropic-ai/claude-agent-sdk-*`, `@openai/codex` + `@openai/codex-*`) are asar-unpacked
  (`forge.config.ts`) so the binaries are spawnable.
- **Tool/MCP wiring:** pass the result of `createSdkMcpServer(...)` *directly* as the `mcpServers`
  value (`{ blockwright: server }`) — do **not** re-wrap as `{ type:'sdk', instance: server }`
  (the docs example is misleading; double-wrapping throws "connect is not a function"). Lock the
  agent down with `tools: []` (no built-ins) + `allowedTools: ['mcp__blockwright__emit_structure']`
  + `settingSources: []` (don't load this repo's own CLAUDE.md).
- **Visual self-review loop (quality > latency):** a single blind emit produces boxy massing and
  broken roofs — the knowledge base's design audit is impossible if the model never sees the build.
  So generation is an **emit → render → review → refine** loop, not one shot. After each
  `emit_structure` the handler asks the renderer to load + screenshot the compiled `.nbt` and
  returns those images as **image content blocks in the tool result**; the model critiques them
  against the prompt/reference and re-emits a complete improved structure, stopping when it matches
  (capped at `BW_AI_MAX_ROUNDS`, default 4 — but floored to the number of design passes). The loop is
  **phase-driven** (`ai/phases.ts`): instead of one vague "make it better", the orchestrator walks the
  model through ordered design passes — massing → roof → facade → interior → circulation → audit — and
  the `onEmit` feedback briefs the NEXT pass's focused rubric each round (`phaseBriefing`). The
  orchestrator owns the pass pointer (`phaseIndex`, advances one pass/emit, clamped at audit) so it
  works on every provider; `emit_structure` takes an optional `phase` the model reports (reinforces the
  workflow + drives the "Facade (3/6)" progress label). Detail passes use mode `patch` (cheaper).
  The final **Audit pass is a gated critic**: the model must report an `audit` checklist (per-item
  ok+note for massing/roof/facade/interior/circulation/physical, judged against the screenshots) and
  the orchestrator refuses to signal stop until every item passes (or the round cap) — `summarizeAudit`
  in `phases.ts`. This is the lever for the aesthetic/layout defects that can't be enforced in code.
  Because the *builder* rubber-stamps its own audit, the gate is driven by an **independent critic**
  when available (`ai/critic.ts` + `providers/getCritic`): a SEPARATE, fresh-context model call
  (claude-sdk `query` with no resume/tools, or the anthropic Messages API) that judges only the
  screenshots + checklist and returns the failing items — it has no stake in the build, so it catches
  what the builder rationalizes. Claude paths only; other providers fall back to the self-report.
  `BW_AI_CRITIC_MODEL` can point the critic at a cheaper model. **Extended thinking is on by default** (`BW_AI_THINKING_BUDGET`,
  default 8000 tokens, `0` disables) so it can plan geometry, and the system prompt tells it to plan
  → emit → review rather than emit immediately. The render round-trip: main calls a `CapturePreview`
  callback (`generate.ts`) → `IPC_EVENTS.aiRenderRequest` to the renderer → `App.tsx` runs `load()` +
  `Viewer.capture()` (synchronous multi-angle PNGs, downscaled) → replies on
  `IPC_CHANNELS.aiRenderResult`, which resolves the matching pending promise in `ipc.ts`
  (`pendingRenders`, with a timeout so a stuck render doesn't hang generation). The user watches the
  build evolve live since each version loads into the viewer.
- **Output-token cost / volumetric `ops`:** the dominant cost for any non-trivial build is **output
  tokens** — the model must serialize every block, so a flat per-block list is `O(blocks)` to emit
  and a big build can blow past the single-response output cap. The fix is the **volumetric `ops`**
  authoring primitive (fill/hollow/walls/line/block, expanded in `structure/authoring/ops/`); the prompt
  + knowledge (`knowledge/nbt/00-volumetric-ops.md`) steer the model to describe geometry as ops
  (one `fill` = a whole wall) instead of thousands of blocks. (There is no time cap — generation runs
  until the model is satisfied, hits `BW_AI_MAX_ROUNDS`, errors, or the user cancels.)
- **Templates (`template` op):** the cheapest geometry primitive — `{ op:'template', name, from,
  to, params }` expands a named preset (`structure/templates/`) into ops at compile time, so the
  model stands up a whole building shell in ~5 lines and then layers its own ops on top. Documented
  for the model in `knowledge/nbt/13-templates.md`; block-name params are validated against the real
  content pack in `generate.ts` (templates intern their own palette, so those names never reach
  `palette`). Add a preset in `templates/index.ts` + its block-name params in `BLOCK_PARAM_KEYS`.
- **Optional build details:** `NewStructurePanel`'s composer has a "⚙ Details" section (type, style,
  size, floors, rooms, basement, materials, decay, interior, lighting). All optional; they're folded
  into the prompt as a structured "[Build details]" brief (renderer-side, no IPC change) and cleared
  after sending, so follow-up edits don't re-send stale hints.
- **Floor plan (`▦ Floors`):** the composer's "Floors" section lets the user define named vertical
  levels (`FloorDef` = `{id,name,from,to}`, an inclusive y range — `normalizeFloor` migrates legacy
  `{y}` records). They live on the Document (`state/documents.ts`, `setFloors`) and persist with the
  chat history (`ChatRecord.floors`, written eagerly via `persistDoc` on every edit), so — unlike the
  one-shot Details brief — they ride along as a `[Floor plan]` context block on **every** prompt
  (`buildFloorPlan` in `state/generation.ts`, appended to `promptText` only, never the visible
  transcript). That's what lets a follow-up like "redo the basement" map to a concrete y range.
  Each level is highlighted as a translucent band in the viewer (`Viewer.setFloorRegions` — one
  hued box + labelled sprite per level spanning the footprint, re-applied after every load since
  `clear()` drops the meshes but keeps the desired regions). The bands are driven from `App` against
  the active doc's plan; the `floorsOnlyWhenEditing` setting (default off → always shown) scopes them
  to when the Floors section is open (`store.floorsEditing`). "New" clears the plan; "Clear versions"
  keeps it. The Details size fields prefill from the open structure's `size`.
- **Progress + cancel:** `generateStructure` takes an `onProgress` callback; `ipc.ts` forwards it
  to the renderer as `IPC_EVENTS.aiProgress` (the panel filters by session id). Phases include
  `rendering`/`reviewing` for the self-review loop. Live tokens come from `includePartialMessages`
  stream events — input includes cached context, output blends the thinking-token estimate (during
  thinking) with a chars/4 estimate of the streamed tool JSON (during building, since `message_delta`
  only reports the count at turn end). Cancel aborts a per-session `AbortController` via `aiCancel` →
  `cancelGeneration`.

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
  titled, draggable (clamped to the stage), redock / minimize / **close** (close hides via
  `setVisible(false)` — reopen from the View menu). Layout lives in `state/windows.ts`
  (persisted; `generate.visible` is restored now, not force-hidden). The native **View** menu
  shows/hides each window and offers Layout ▸ Reset Window Positions; `App.tsx` reports
  `{visible,available}` per window to main (`reportWindows`) so the menu's checkmarks/enabled state
  track the renderer (which owns the state). Don't inline window positions — go through the store.
- **Home / tabs:** `activeId === null` (documents store) is the **Home** state — the Welcome screen
  shows whenever there's no active doc, even with tabs still open. The title-bar logo button
  (`TabBar`, `goHome()`) returns there; clicking a tab restores it. The Generate dock tab has no
  close button (close it from View ▸ Generate, like Info/Versions).
- **About is one place:** there's a single About — Settings ▸ About (`SettingsModal` `AboutTab`,
  app version via `getAppVersion` IPC). The native macOS "About" menu item routes to it
  (`notifyOpenSettings('about')` → `store.settingsSection`), so the default Electron panel never
  shows.
- **Renderer is React:** UI is JSX (React escapes interpolated strings, so there's no `escapeHtml`).
  The Viewer is imperative Three.js bridged via `viewer/ViewerProvider.tsx`; it's created once and
  has no teardown, which is why `index.tsx` does **not** use StrictMode.
- **Recents are owned by main:** `recents.ts` is the single source of truth. The native
  File menu and the renderer both mutate it via IPC; every mutation rebuilds the menu and
  broadcasts `recentsChanged`, which the welcome view re-renders from (don't keep a separate
  authoritative copy in the renderer).
- **macOS chrome:** the window uses `hiddenInset` titlebar with an **opaque themed background**
  (no vibrancy — it made light mode look washed out and the splash mismatch the bg). There is no
  separate titlebar component — `TabBar` is the single slim top bar (`.tabbar`, height 36, kept in
  sync with `windows.ts` `TITLEBAR_H` and `--titlebar-h`; `trafficLightPosition.y` centres the
  lights in it). It's the drag region (`-webkit-app-region: drag`) with traffic-light clearance on
  mac; interactive children opt out with `no-drag`.
- **Theming:** colors are CSS variables in `index.css` (`--bg`, `--panel`, `--text`, `--accent`, …);
  components reference tokens, never hardcoded colors. **`--bg` is opaque** and theme-aware — it's
  the app/window background AND (because the viewer's WebGL canvas is `alpha:true`) the 3D scene's
  backdrop, so the welcome and the NBT viewer share one background. Two things move together:
  (1) CSS — base `:root` is dark, the OS drives the *default* via `@media (prefers-color-scheme:
  light) { :root:not([data-theme]) }`, and an explicit choice sets `[data-theme="light|dark"]`
  (wins; strict CSP forbids a no-FOUC inline script, so don't add bare `prefers-color-scheme`
  rules — scope them to `:not([data-theme])`). (2) **`nativeTheme.themeSource`** (set from
  `state/theme.ts` via the `themeSet` IPC) so the renderer's `prefers-color-scheme` (and the native
  traffic lights / dialogs) follow a forced theme — the themed `Logo` (`<picture>`) and the boot
  splash rely on that tracking. `settings.theme` is 'system'|'light'|'dark' (default system).
  `--mono` is for numeric/dimensional data (sizes, counts, coords).
- **App icon / logos:** the in-app logos live in `public/` (`logo-dark.png`, `logo-light.png`),
  referenced relatively (`logo-dark.png`, not `/logo-dark.png`) so they resolve under `file://` when
  packaged; the `Logo` component swaps them by theme. The app/dock icon is the standardized
  **logo-dark**: `build/icon-master.png` (a trimmed, centered 1024² master) → `build/icon.icns` (the
  packaged bundle icon, via `forge.config`) + `build/icon.png` (the dev dock icon, `app.dock.setIcon`).
  Regenerate the icon from `build/icon-master.png` (or re-trim from `public/logo-dark.png`).
- **Boot splash:** static markup + inline `<style>` in `index.html` inside `#app`; React's
  `createRoot(...).render()` replaces it on mount, so the window never shows empty. Its background
  is hardcoded to the same values as `--bg` (light/dark via `prefers-color-scheme`) — keep them in
  sync so there's no jump when the app mounts.

## Visual testing (no screen-recording permission needed)

The app can screenshot itself headlessly. Set env vars when launching:
- `BW_OPEN=/path/to/file.nbt` — open a file on startup.
- `BW_CAPTURE=/path/out.png` — render, write a PNG, then quit (~2.5s delay). On a cold
  dev start (Vite re-optimizing deps) 2.5s can capture a blank page; bump it with
  `BW_CAPTURE_DELAY=8000` (ms).
- `BW_CONTENT=/path/to/content` — override the content-pack location.
- `BW_WORKSPACE=/path/to/mod-project` — activate a mod workspace on startup.
