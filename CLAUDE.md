# Blockwright

Electron desktop app that renders Minecraft `.nbt` structure files in 3D and AI-generates
new ones. Built with Electron Forge + Vite + TypeScript + React + Three.js. Block
models/textures come from an extracted Minecraft "content pack" on disk.

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
    logger.ts             Patches the main-process console: mirrors every line into a ring buffer
                          (backlog for the Console dock) + tails it live to the renderer over IPC,
                          still calling the original so the terminal keeps working
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
                             chest.ts, bed.ts, banner.ts (wall), skull.ts, decorated-pot.ts,
                             index.ts (dispatcher)
      catalog/
        block-catalog.ts     Enumerate placeable blocks (vanilla pack + active workspace namespace,
                             namespace-aware) + a representative texture per block → the Block Catalog.
                             `previewBlock(id)` resolves one block into a 1×1×1 StructureData for the
                             catalog's live 3D preview (renderer reuses buildStructure on it).
      jigsaw/
        jigsaw.ts            Extract jigsaw connectors from a structure's block-entity NBT
        template-pool.ts     Resolve worldgen template pools + structure templates (namespace-aware)
        jigsaw-assembler.ts  Plan a (seeded, bounded) jigsaw assembly + validate connectors
      domain/              Composable generation: MODULES by CATEGORY (structure × decoration
                           crossed by the `template` op in the authoring compiler — the model emits
                           one op, the code produces the geometry — plus geometry-bearing roof/
                           basement/attic/surroundings modules and guidance-only interior `room`
                           modules assigned per floor). See "Composable generation domain" below.
        modules.ts         ModuleMeta (id/label/category/description/knowledge/keywords/preview) — the
                           RICH build-bearing contract shared by every module + toSummary (project to the
                           wire shape). The renderer-facing shapes (`ModuleCategory`, `ModuleParam`,
                           `ModuleSummary`=`GenerationModule`, `ModuleCatalog`=`GenerationCatalog`,
                           `ModuleSelection`=`Omit<BuildSelection,'size'>`) are ALIASES of the canonical
                           defs in `@/shared/types` — they cross IPC, so they live ONCE there; never
                           re-declare a second copy in the domain (it only drifts).
        registry.ts        createRegistry<T extends ModuleMeta> — the shared factory (get/has/ids/
                           all/list) every category's index.ts is built on, so the per-category
                           lookup boilerplate exists once.
        categories.ts      The registry-of-registries: REGISTRIES (category→Registry) + getModule
                           (category,id) and getGeometryModule (roof/basement/attic/surroundings→GeometryModule),
                           so a dynamic lookup is ONE map access, not a `category==='roof'?…` ternary
                           repeated across compose/preview/slot resolution.
        geometry-module.ts GeometryModule — the build shape (params/defaults/build/integrations)
                           shared by RoofModule/BasementModule/AtticModule/SurroundingsModule (they extend
                           it + narrow category/appliesTo), declared ONCE instead of N identical copies.
        groups.ts          STRUCTURE_GROUPS — the structure FAMILIES (currently one: 'house'). Every
                           structure type declares `group`; a module's `appliesTo` can name the GROUP id
                           to pair with the whole family at once (`moduleAppliesTo` resolves the host's
                           group); the UI headers the gallery rail + the structure Select by group.
        roles.ts           Semantic block roles (wall/floor/roof/…) + BASE_BLOCKS fallback + isRole
        params.ts          ParamSpec/ParamDef + resolveParams + paramFields (single per-type param decl)
        compose.ts         composeStructure (THE cross) + composeBlockNames + isKnownStructure
                           (decoration param accepts `decoration` or legacy `theme`)
        index.ts           barrel + catalog (listModuleCatalog), selection→guide mapping
                           (selectedGuides/promptGuides), buildModulePreview (gallery)
        shell-kit.ts       The shared house-shell PARTS kit (like stair-core: a parts kit, not a base
                           class): roofFormFor/roofCap (the ROOF GUARANTEE — a pitched pick that can't
                           fit or can't pitch still caps with the flat module, never roofless),
                           storeyEntries (ladder → authoritative FloorPlanEntry[]), seatDoor,
                           cornerPosts, storeySlabs, ceilingLanterns. Every house type composes its
                           casco from these; per-type code is only the genuine identity geometry.
        structure-types/   Category "structure": one file per archetype, ALL FIVE SEEDED with code-built
                           shells — classic (pitched storeyed home; its seed varies window rhythm/corner
                           treatment/roof form/chimney side per run) + (modern = flat-roofed
                           glass villa by default, but HONORS the Roof pick — a gable/hip crowns the upper
                           volume in white quartz stairs, reserving the pitch height; farmhouse = L plan +
                           cross-gable + veranda; sakura = pink cherry
                           cottage RAISED on a visible stone basement with an exterior stair to the upper
                           entry; gothic = black+white manor with a central frontispiece tower, balustraded
                           front veranda, mini corner tower, glass chapel wing + ivy eaves) + types.ts
                           (contract: Box/logProps + `seedShell`/`pairedDecoration`/`complex` + `floors()`)
                           + stair-core.ts (addStairCore — the shared switchback stair core every code-built
                           house lays, taking the build's RolePalette; a `parts` helper, no cross-type
                           imports) + farmhouse-parts.ts (farmhouse-only pieces) + index.ts (registry).
                           A type emits ops in terms of roles (never concrete blocks), composes its casco
                           from shell-kit parts, keeps ONE `plan()` feeding both `build()` and `floors()`,
                           and delegates roof/basement to modules. See "Seeded archetypes" below.
        decorations/       Category "decoration": one file per look (cozy) + types.ts (Decoration
                           contract) + index.ts (registry, DEFAULT_DECORATION='cozy'). A decoration
                           maps roles→blocks + decay + weathering.
        basements/ roofs/  Categories "basement"/"roof"/"attic": one file per typology (roof: gable/
        attics/            hip/flat; basement: cellar/crypt/cult-temple; attic: storage/bedroom)
                           + types.ts + index.ts (registry) each.
                           SELECTABLE in the composer Details (filtered by the chosen structure's
                           `appliesTo`) + listed in the gallery. Each carries GENERIC geometry
                           (`build()`, any host) + optional HOST-SPECIFIC extras (`integrations[host]`,
                           e.g. house-only gable vents), run by `composeModule`/`composeModulePreview`
                           — roofs + basements render live in the gallery; a pick also rides into the
                           prompt as guidance + loads only its knowledge guide. A structure type also
                           DELEGATES its own roof/basement to these modules at build time (the house calls
                           `args.composeModule(...)` — see "Composable generation domain"), so a module is
                           the single source of that geometry. Each declares `appliesTo` (the structures it
                           pairs with, e.g. ['house']) — a growing link driving Details filtering + guide gating.
        rooms/             Category "room": one file per interior program (living/kitchen/library/
                           bedroom/dormitory/storage), each a `defineRoom({...})` of PURE DATA +
                           define.ts (the factory: fills category/knowledge-path/preset-ids + default
                           hosts) + types.ts (RoomModule = ModuleMeta + required `knowledge` + `presets`,
                           no geometry) + index.ts (registry). GUIDANCE-ONLY — no `build()`/`preview`:
                           the user assigns up to two rooms per floor in the composer Details (house),
                           each loads only its knowledge guide and rides into the prompt as a `[Room
                           plan]` line per floor; the AI furnishes the interior. `appliesTo` = ['house'].
                           Each room also ships FURNISHING PRESETS tiered by floor SPACE (snug/standard/
                           grand) — the SPACE × DECORATION organism (see `shared/domain/furnishing.ts`):
                           a decoration-AGNOSTIC base layout per tier that the brief picks by the room's
                           computed area + the gallery lists. So a big floor never comes out empty.
        surroundings/      Category "surroundings": one file per yard typology (modern, garden) +
                           types.ts (SurroundingsModule, required `appliesTo`) + outline.ts (the shared
                           seeded chamfered OUTLINE: rimCells/inCut/seededChamfers — the lawn is CLIPPED
                           to it, so the yard's footprint is never the plain rectangle) + index.ts
                           (registry + `insetHouseBox` + the shared `yardFor` every host's build()/
                           floors() opens with). A GROUND-LEVEL landscaping RING laid OUTSIDE the
                           building shell: the user's W×D is the SHELL, the compiled box grows by the
                           ring margins. By default those AUTO-SCALE with the house (`SURROUND_SCALE` in
                           `shared/domain/surroundings.ts` — base→max, +1 cell per 4 shell cells past 14),
                           but the composer's YARD-SIZE control lets the user OVERRIDE them with explicit
                           per-side cell margins (`SurroundSizing {side,front,back}`, the manual Width-X /
                           Depth-Z steppers). `resolveSurroundMargins(id,w,d,override?)` is the single
                           resolver (override wins, else auto); `surroundMargins`/`expandSizeForSurroundings`/
                           `surroundMarginsForOuter`/`insetHouseBox`/`yardFor` all take the optional override
                           — with an override the margins are used DIRECTLY (house = outer − override, no
                           inversion), without one main inverts the auto expansion exactly via
                           `surroundMarginsForOuter(id,W,D)`. Same math on both sides of IPC (the override
                           rides through `BuildSelection.surroundSizing` → shell-seed `params.surroundSizing`
                           → `BuildArgs.surroundSizing` + `floors()` + the module's `args.surroundSizing`).
                           The host structure INSETS its massing and delegates the ring via
                           `composeModule('surroundings', …, {surroundSizing})`. The module re-derives the
                           house footprint from the same resolver, so host and ring always agree. Own palette
                           over the decoration (like a basement — a lawn stays a lawn); ring stays ≤3
                           cells tall (landscaping, never construction — the cap is the lamp-post
                           lantern); leaves placed persistent.
                           modern = pool terrace + stepped entry walk aligned with the door + chamfered
                           hedge rim + planters + seeded bushes/bollards; `appliesTo: ['modern']` (the
                           villa declares the `surroundings` param, marked `module:'surroundings'`).
                           garden = the cottage homestead yard for every NON-modern house
                           (`appliesTo: ['classic','farmhouse','sakura','gothic']`, all four declare
                           the param): a cobble-course + oak-fence perimeter whose corners are cut by
                           SEEDED stepped chamfers (the outline varies every build), stone lamp posts,
                           a double-door front gate aligned with the house door, a dirt walk + a loop
                           path around the house, facade flower beds, and seeded features (fountain or
                           stone well, hydrated crop plots, flower parterre, bushes). Uses the garden
                           roles (`path`/`soil`/`crop`/`flower` in roles.ts). The ring is code-built
                           geometry, shipped with the host's seeded shell (every house type seeds —
                           see ai/shell-seed.ts).
        rng.ts             shared seeded PRNG (mulberry32/seed3)
        footprint.ts       seeded non-rectangular footprints (rect/L/T/U/plus) so a basement isn't always
                           a square box (param `shape`, default `auto`). Tests in domain/__tests__/.
    mc-version-detect.ts   Detect a mod's target Minecraft version from its project files
    ai/                     AI structure generation (File ▸ New Structure)
      generate.ts           Provider-agnostic orchestrator: owns sessions, the round budget + live
                            progress, and the shared EmitRunState; wires the per-emit handler and
                            dispatches to a provider driver. `generateStructure(GenerateStructureOptions)`
                            takes an options object.
      emit-handler.ts       createEmitHandler(deps) — the per-emit validate→compile→mirror→render→review
                            step, extracted from the orchestrator so it's its own (testable) module. It
                            ADVANCES the shared EmitRunState each emit; the orchestrator reads it after
                            the driver run to assemble the result. Owns the COLLAPSE GATE (see "Seeded
                            archetypes"): a delta-only "full" emit is rejected, never versioned.
      review-content.ts     buildReviewContent(...) — pure: assembles the content blocks (status +
                            fix/warning notes + reference target + screenshots) returned to the model
                            after each emit so it can review its own build. Tested in __tests__/.
      token-meter.ts        TokenMeter — the live token accounting (input across turns + the committed/
                            running-estimate output blend), extracted from the orchestrator so the blend
                            math is unit-tested; generate.ts keeps phase/turn/logging around it.
      patch.ts              mergePatch(prev,input) — pure: append a `patch`-mode emit's palette/ops/
                            blocks onto the previous version (size/floors/etc. inherited).
      emit-validate.ts      validateEmit(authoring) — the pre-compile gates (structural validity →
                            no `minecraft:light` → only real block ids); returns a {reason,feedback}
                            rejection for the model to self-correct, or null.
      schema.ts             Shared system prompt + emit_structure schema (rich JSON Schema for the
                            Claude SDK tool; a flat string-schema parse for Codex structured output)
      credentials.ts        Multi-provider credential store (per-provider secret via safeStorage) +
                            active-provider/model prefs + env precedence
      session.ts            Per-chat session state (provider session id + version counter + hidden
                            scratch dir `<userData>/generated/<sessionId>/vN.nbt`) + AbortControllers
      output-dir.ts         The user's browsable structure LIBRARY: configurable root (default
                            `~/Documents/Blockwright`, `BW_OUTPUT_DIR` overrides) where each session
                            gets ONE descriptively-named FOLDER (`<slug-from-prompt>/`), reserved once
                            per session (`reserveLibraryDir`/`mirrorToLibrary` — best-effort copy):
                            the latest clean `<slug>.nbt`, every kept `versions/vN.nbt`, and the build's
                            `generation.log` (the AI/fix play-by-play, see gen-log.ts `RunLog`)
      providers/            One Driver per backend (claude-sdk, codex — the only two) +
                            index.ts (lazy dispatch) + types.ts (the Driver contract)
      knowledge.ts          Load the knowledge/nbt guides as the generator's system prompt in THREE
                            tiers (knowledge-select.ts): always-on CORE guides; CONDITIONAL core guides
                            gated on build characteristics (`CONDITIONAL_CORE` — e.g. 08-complex-structures
                            rides along only when `isComplexBuild`: a basement / ≥2 rooms / a structure
                            flagged `complex` / a scale-or-rooms keyword in the prompt — conservative);
                            and a MODULE guide (knowledge/nbt/modules/**) only when its module is selected
                            or the prompt's keywords match it (the domain's selectedGuides/promptGuides).
                            All to cut the per-turn (re-sent every round) system-prompt token cost.
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
                          fixes/warnings. ctx carries `size` + the selected `structureType`.
                          ALWAYS-ON: preserveShell (runs FIRST; a no-op unless `ctx.lockCells` is
                          supplied — for a shell-seeded structure it restores any shell cell the
                          model DELETED/aired-out, so the code-built exterior floor/roof/walls/tower can't
                          be gutted; the model may still redecorate solid→solid, glaze walls and furnish),
                          rebuildStairwells (code OWNS vertical circulation — see below),
                          connectBlocks (derive pane/bar/fence/wall sides from neighbours — the AI omits
                          north/south/east/west, so an isolated pane would render as the bare `_post`
                          column; splits palette per side combo), fixDoors, fixPlacement (also drops
                          orphan UPPER door halves + floating pane/bar/fence/wall groups with no solid
                          anchor — the "door in mid-air" / "iron bars over the roof" defects),
                          fixCirculation (generic safety net: stray ladders / orphan floor holes),
                          fillInteriorAir (clear each column's interior without gouging terrain).
                          STRUCTURE-SCOPED finalizer, gated by the selected structure module's declared
                          `finalize` list (see domain): fixChimney ('chimney' — house only: campfire-
                          anchored, complete the flue / drop a floating cap / keep one chimney). NEW
                          always-on checks plug in here; new per-structure fixes add a `FinalizePass`
                          id + a module `finalize` entry.
                            rebuildStairwells (passes/stairwells.ts) is the DEFINITIVE circulation pass:
                          always-on + self-gating — it detects the storey FLOOR PLANES,
                          collects the model's flight/ladder hints (which gap each serves), strips the
                          broken geometry, and rebuilds ONE clean connector per gap — a straight stair
                          when a 45° run fits in the interior (full top step reaching the upper floor,
                          opening sized to the run, 2-block headroom, landings) else a flush wall ladder
                          (hung on the shell OR an interior wall). Connectors reserve their cells so two
                          can't collide; a gap it can't solve keeps the model's geometry + warns. Roof
                          slopes (gables of stairs) are excluded via findFlights/topCeilingY.
      compile.ts          compileStructure / compileStructureReport / writeStructureFile
                          (validate → resolveBlocks → runPasses → encode), each taking optional
                          CompileOptions {structureType}; `pipelineFor(structureType)` assembles the
                          always-on passes + the module's gated finalizers. writeStructureFile
                          returns a CompileReport ({fixes,warnings}) for the generator to surface.
  renderer/                React app (Vite + @vitejs/plugin-react). No Node/fs/electron — IPC only.
    index.tsx             Entry: initTheme() then createRoot(#app).render(<App/>) (no StrictMode — see gotchas)
    App.tsx               Orchestration: layout (TabBar/stage/Statusbar) + composition of the app/ hooks
    app/                  The Shell's concerns, one hook per responsibility: useDocumentFlow (open/load/
                          close + workspace-suggest handlers), useAppIpc (native-menu/file IPC wiring +
                          file/window-state report to main), useAiRenderBridge (the self-review render→
                          screenshot bridge), useViewerSync (store→viewer effects), capture.ts (helpers)
    api.ts                Typed accessor for window.blockwright (the preload bridge)
    components/           FloatingWindow (shared window chrome), Statusbar, Welcome (themed Logo + action
                          cards), TabBar (the single slim top bar — no separate titlebar), WorkspaceBadge/
                          Suggest, Loading, SettingsModal (tabbed shell; each tab is a component in
                          components/settings/: Appearance/Viewer/Ai/About), VersionSelectModal, CatalogModal
                          (Block Catalog: list/grid + 3D preview — store.catalogOpen), ModulesModal
                          (Module Gallery: a host-first composition blueprint — pick a structure, see the
                          roof/attic/basement/room/decoration parts that link to it + 3D preview —
                          store.modulesOpen), GuideModal (the in-app user Guide — store.guideOpen, opened
                          from Help ▸ Guide / the welcome link: a sectioned modal with inline SVG diagrams
                          + lucide icons), ConsoleDock (the full-width bottom log dock — see below).
                          NewStructurePanel (the Generate CHAT, for editing an open build) is a thin
                          ORCHESTRATOR — it owns the composer's transient state + effects and composes the
                          view from focused parts in components/generate/: ChatTranscript (empty state +
                          messages + result stats + live progress), Composer (attachments + section slots +
                          textarea + an "Advanced" button that opens the planner overlay + icon action
                          toolbar), DetailsSection (the progressive Details — a PURE view: the structure
                          pick + every single-select slot/enum param render as the themed `ui/Select`
                          dropdown (NOT chip groups; the structure pick is `searchable` and grouped by
                          family via `catalog.groups`), plus the size box (a storeyed structure is ALWAYS
                          sized PER FLOOR — one height input per storey with a link/chain toggle; there is no
                          "Total" height mode), the YARD-SIZE control when a surroundings ring is picked
                          (the SAME boxed number-stepper panel as the floor heights: Width X / Depth Z in
                          cells, nudged in 2-cell steps) + per-floor rooms), FloorsSection (the ▦ Floors editor), BuildCard (the chat
                          build card), BuildProgress (the COMPACT live progress bar — phase + design-pass +
                          a determinate fill from designStep/designSteps + elapsed/tokens, shared by the dock
                          and the stage), StageBuilding (the centered "building…" card shown over an empty
                          new-build tab in the gap before the first version loads). The BuildPlanner is the
                          Details-FIRST surface in TWO modes from one shared PlannerView (config column =
                          DetailsSection + a prominent description field; right = a live BuildScalePreview):
                          INLINE (NewBuildPanel — the default stage for a brand-new tab / Welcome ▸ Generate;
                          App renders it for an empty, non-busy doc) and OVERLAY (the chat's Advanced button,
                          over an open `.nbt`). Both modes + the dock's free-text composer build the SAME
                          brief/selection (generation/brief.ts) and hand off to runGeneration — generating and
                          editing are one unified loop. State lives in state/planner.ts (the shared draft).
    components/ui/        Reusable primitives: Modal (overlay+panel shell), Segmented (toggle), Select
                          (the themed single-select dropdown — portal-rendered in `position:fixed` so it's
                          never clipped by a scrolling column, keyboard-navigable, options carry an optional
                          one-line `description` clamped with ellipsis + the full text on hover; options can
                          also carry a `group` (family) label — contiguous runs get a header/divider, and
                          the opt-in `searchable` prop adds a sticky search box whose filtered results keep
                          the group name inline on each row; the OPAQUE
                          `--elevated` token backs the menu, never the translucent `--panel`), Logo
                          (themed <picture>), StructurePreview (standalone Three.js scene that frames any
                          StructureData; auto-fits camera), BlockPreview (thin wrapper for one block).
                          Build dialogs/controls from these so fonts/spacing/styles stay consistent. Prefer
                          `Select` over a native `<select>` or a fresh single-select chip group.
    generation/           Pure (no-React, no-IO) helpers behind the Generate composer, extracted from
                          NewStructurePanel/state so they're unit-testable: brief.ts (BuildDetails →
                          the model's "[Build details]" brief + BuildSelection + the BuildBrief chat
                          card + size/floor helpers — incl. `effectiveSize`/`totalHeightFromFloors`/
                          `defaultFloorHeights` for the per-floor-height model: `BuildDetails.floorHeights`
                          is a height per above-ground storey (total derived from their sum + roof/basement
                          overhead). A storeyed structure is ALWAYS per-floor — the heights are SEEDED on the
                          structure pick (`defaultFloorHeights`); there is no "Total/auto" height mode (the
                          link/chain toggle covers "don't size each floor by hand"). `null` only for a
                          NON-storeyed type (a single H field). Also `surroundRing` (the picked yard's
                          effective per-side margins, auto or the user's explicit override)), details.ts
                          (pure reducers over BuildDetails — field/room/param/size edits + `setFloorHeight`
                          + `setSurroundSize` (the manual yard margins); editing a param or slot PRESERVES an
                          explicit `size` — never snaps it back to auto — and a `floors` change resizes the
                          per-floor heights; a structure pick pairs the module's declared `pairedDecoration`
                          and seeds the per-floor heights), attachments.ts (reference-
                          image intake) and floors.ts (normalizeFloor + buildFloorPlan).
    windows/              ControlsWindow / InspectorWindow / JigsawWindow — the three floating windows
    hooks/useStores.ts    useApp / useSettings / useWindows / useLogs (React bindings over the vanilla stores)
    state/                store.ts (main-mirrored + view state), settings.ts (prefs, incl. theme),
                          windows.ts (floating-window layout + the Console dock visibility/height,
                          persisted), logs.ts (the Console dock store: patches the renderer console,
                          pulls main's backlog + tails its live lines, capped + deduped), theme.ts
    ui/path.ts            basename/dirname helpers (no Node path across the bridge)
    viewer/               Three.js Viewer (scene/lights/loading/render loop) + ViewerProvider (React
                          bridge) + mesh/geometry/texture building. Focused concerns split out of the
                          Viewer class: camera-controller.ts (CameraController — the camera + orbit/fly
                          navigation + framing), capture.ts (the AI-review screenshot paths: orbit/
                          cutaway/section — encoded via the shared `REVIEW_SNAP` = JPEG@512 to keep the
                          re-sent/accumulating review images cheap; cutaways scale ~1/storey and yield 0
                          for a shallow single-volume build the section already reveals), floor-regions.ts
                          (FloorRegionsOverlay — the floor-plan
                          bands), highlight.ts (FocusHighlight — the inspector focus box).
  shared/
    ipc.ts                Single source of truth for IPC channel/event names
    types/                Type-only contracts shared by both bundles, grouped by domain
                          (structure, workspace, jigsaw, generation, app, api = BlockwrightApi) +
                          an index.ts barrel — so `@/shared/types` stays the one import path
    jigsaw.ts             Pure jigsaw geometry/alignment (rotation, attachment, AABB, seeded RNG)
    domain/               Pure domain predicates shared by BOTH processes (no Node/electron) so the
                          two sides can't drift: applies-to.ts (moduleAppliesTo — the renderer's
                          Details filtering and the main guide gating call the SAME function; it also
                          takes the host's GROUP id, so an `appliesTo` naming a structure FAMILY — e.g.
                          'house' — matches every member) +
                          conflicts.ts (modulesConflict — symmetric `incompatibleWith` check, dims the
                          gallery + Details) + module-slots.ts (MODULE_SLOTS + ModuleSlotKey — the
                          single-select module categories: ONE registry that drives the brief, the
                          Details selects, the build-card chips, the structured selection AND the
                          knowledge-guide gating, so "add a category" is one slot entry, not edits in
                          ~10 files; ModuleSlotKey also DERIVES the per-slot fields of BuildDetails/
                          BuildSelection/BuildBrief — see below) + storeys.ts (the canonical STOREY
                          LADDER: planStoreys — explicit per-floor heights with proportional clamping,
                          else the uniform split — + roof-aware heightOverhead + sanitizeFloorHeights;
                          the renderer's size math and every structure type consume the SAME functions,
                          so the height the composer promises is what the shell lays) + furnishing.ts (the SPACE × DECORATION
                          model: RoomScale tiers + scaleForArea + FurnishingPreset + presetForScale — the
                          room-plan brief picks a preset by area, the gallery lists them; thresholds once).
    mc-version.ts         Parse/normalize MC versions + the supported-for-jigsaw predicate
    i18n/                 Tiny framework-free i18n shared by both processes: en.ts (canonical key
                          space) + pt-BR.ts (typed complete) + index.ts (resolveLocale/translate/
                          makeT/LanguageInfo). Flat dot-keyed `Record<MessageKey,string>`, `{token}`
                          interpolation, fallback locale→en→key. See "Internationalization (i18n)".
content/                  Extracted Minecraft content pack (assets/minecraft/...). Shipped as extraResource.
```

### Internationalization (i18n)

English + pt-BR, default = the OS language (`app.getLocale()`). **Main owns the language
preference** (`main/language.ts`, persisted `language.json` in userData) so the native menu can
localize at startup without a renderer round-trip; main strings use `mt(key)`. The renderer mirrors
it through the `language:get`/`language:set` IPC channels + the `language-changed` event: `state/i18n.ts`
is a Zustand store seeded by `initI18n()` (in `index.tsx`), and components read `const t = useT()`
(`hooks/useStores.ts`) so they re-render when the locale changes. The language picker is in BOTH the
native **Language** submenu (app menu on mac, File on win/linux) and **Settings ▸ Appearance**; both
go through `setLanguage`, which rebuilds the menu + pushes `languageChanged`. **New user-facing string:**
add it to `shared/i18n/en.ts` AND `pt-BR.ts` (pt-BR is typed against en, so a missing key won't
compile), then `t('key')` in the renderer or `mt('key')` in main. The whole renderer UI is wired
(shell, menu, all Settings tabs, Generate panel, catalogs, module gallery, inspector/jigsaw/versions
panels, floating-window chrome). The **`ai.genRoundsAuto`** field shows "Auto" for `maxRounds:0`.

**Registry DATA is localized too** (provider/model lists in `shared/ai.ts`; `structure/domain` module +
param + furnishing-preset labels & descriptions). Because English is authored INLINE in those registries
(not in `en.ts`), it uses a separate **override** mechanism in `shared/i18n/registry.ts`: English is the
canonical fallback, and `data-pt-BR.ts` supplies only the translations, keyed by the builders there
(`moduleKey`/`paramKey`/`paramOptionKey`/`groupKey`/`presetKey`/`aiProviderKey`/`aiPresetKey`). `localizeData`
returns the override or the English fallback. The module catalog is localized at the IPC boundary in
`main/ipc.ts` (`localizeCatalog(listModuleCatalog(), getLanguage().locale)`); `ai.ts` data (imported
directly by the renderer) is localized in `AiTab` via `useLocale()` + `localizeData`. The catalog re-fetches
on `locale` change (ModulesModal + BuildPlanner deps), and chat build-card labels follow because they derive
from the localized catalog. **When you add/edit a module, param, furnishing preset, AI provider or
generation preset, add its pt-BR entry to `data-pt-BR.ts`** (only model labels like "Opus 4.8" stay literal).
The guard test `shared/i18n/__tests__/coverage.test.ts` fails if any registry-data key lacks a pt-BR override,
OR if a chrome pt-BR value is left identical to English (outside its loanword allowlist) — so English-only
strings can't ship.

### IPC pattern

`shared/ipc.ts` holds all channel/event name constants — never inline channel strings.
`IPC_CHANNELS` = request/response (`ipcRenderer.invoke` ↔ `ipcMain.handle`);
`IPC_EVENTS` = fire-and-forget pushes from main → renderer (e.g. `open-path`).
When adding a feature that crosses the boundary: add the channel in `shared/ipc.ts`,
the handler in `main/ipc.ts`, the method on `BlockwrightApi` in `shared/types/api.ts`, and
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

`structure/domain/` is the data-driven model behind the authoring `template` op. Everything
is a **module** in one of seven **categories** (`structure`, `decoration`, `basement`, `roof`,
`attic`, `room`, `surroundings` — `modules.ts` defines `ModuleCategory` + the shared `ModuleMeta`: id/label/description/
knowledge/keywords/preview). The two live growth axes — **structure types** × **decorations**
— combine without N×M code. A **StructureType** (`house`; more can be added) owns only the *massing*
(shell, openings, structural detail) and emits ops in terms of **semantic roles** (`wall`,
`floor`, `roof`…), never concrete blocks. A **Decoration** (`cozy`) owns the *look*: it maps
roles→blocks (sparsely), sets a decay level, and weathers blocks. `composeStructure` crosses
them: it resolves a role's block by **per-op override > decoration.blocks > type.defaults >
BASE_BLOCKS**, resolves the type's params (`params.ts`, the single param declaration), and
calls `type.build(...)` against a decoration-backed `RolePalette`. So any type works with any
decoration, and a new module is one small file.

- **The `template` op:** `op.name` is a structure-type id, `op.params.decoration` (or the
  legacy `theme`) picks the look, and any param keyed by a role name is a block override.
  Compiled in `authoring/ops/index.ts` via `composeStructure`; default decoration is `cozy`.
- **Each type ships its own material `defaults`** (a "kit"), so it looks right even under a
  sparse decoration.
- **A type declares its `finalize` passes** — the modular "which code fix applies to which
  structure" map (`FinalizePass[]`; currently only `'chimney'` — e.g. `classic = ['chimney']`). The
  compile pipeline (`pipelineFor`, via `structureFinalizers(id)`) runs each gated pass only when
  that structure is the SELECTED one (`BuildSelection.structureType`, threaded to `writeStructureFile`)
  — so the single-chimney fix runs on a house but not on a structure that doesn't declare it. These
  run on AI free-form builds too (gated by the Details selection), since the model is bad at the same
  details code can repair. (Vertical circulation needs no finalizer — `rebuildStairwells` is always-on
  and self-gating.)
- **The structure-type CONTRACT is uniform and test-enforced** (`domain/__tests__/contract.test.ts`):
  every type declares group/knowledge/preview/defaults; every STOREYED type (a `floors` param) has ONE
  internal `plan()` (box+params → storey ladder/wall top, via the shared `planStoreys`) consumed by BOTH
  `build()` and an authoritative `floors()` (so the viewer bands/sidecar/stairwell pass always match the
  laid geometry — all five types have `floors()` now); per-type DATA lives ON the module, never as id
  special-cases in general code (`pairedDecoration` drives the composer's auto-pairing; `complex` drives
  the complex-structures guide gate). A cross-type INVARIANT MATRIX (every type × roof × basement × sizes)
  asserts: dense shell (no "casa sem casco"), every interior column covered overhead (no roofless), and
  ZERO module-respect warnings. The `roof` op itself DECKS a truncated pitch at its clamp height (no open
  ridge slot when the box is short).
- **Module-respect verification** (`compose.ts` `verifyModuleRespect`): the injected `composeModule`
  delegate RECORDS every invocation; after `build()`, any requested module that was never delegated —
  a pitched roof pick, the type's own `attic`/`basement` param — surfaces as a compile WARNING instead
  of a silently ignored pick (e.g. a too-short box's attic/basement skip). 'flat' isn't gated (a
  flat cap can be a type's own identity geometry — the modern villa's terraces).
- **Add a structure type:** new file in `structure-types/`, register in its `index.ts`. Follow the
  contract: declare its `group` (the family — `domain/groups.ts`), a `plan()` shared by
  `build()`+`floors()`, compose the casco from `shell-kit` parts
  (roofFormFor/roofCap/storeySlabs/ceilingLanterns/cornerPosts/seatDoor) + `addStairCore`, declare
  `pairedDecoration` if it has an identity look — the contract test fails anything missing.
  **Add a decoration:** new file in `decorations/`, register in its `index.ts`. **Add a role:**
  extend `roles.ts` (`Role` + `ROLES` + `BASE_BLOCKS`). Every module declares a `knowledge`
  path (its guide) + optional `keywords` + optional `preview` spec + optional `appliesTo`
  (the structure-type ids and/or group ids it pairs with — a growing link; omit = applies to all).
- **The single-select module SLOTS are registry-driven** (`shared/domain/module-slots.ts`,
  `MODULE_SLOTS` + `ModuleSlotKey` = decoration/roof/basement/attic/surroundings — NOT structure,
  which is the grouped first pick, nor rooms, which are per-floor multi-select). This one list is
  the single source the brief (`buildBrief`/`buildSelection`/`buildSummary`/`hasDetails`), the
  Details selects (`DetailsSection` loops it), the build-card chips (`BuildCard`), and the
  knowledge gating (`selectedGuides` loops it, resolving each via `getModule(slot.key, id)`) all
  iterate — so a category is ONE slot entry, not edits in ~10 files. `ModuleSlotKey` is also the key
  set that DERIVES the per-slot fields of `BuildDetails`/`BuildSelection`/`BuildBrief`
  (`Partial<Record<ModuleSlotKey,…>>`), so adding the union member adds those fields for free.
  **Add a single-select category:** the module's category files (contract + registry, as below) +
  its array on `GenerationCatalog` + a `listX()` line in `listModuleCatalog` + a `categories.ts`
  registry entry (`REGISTRIES`, so `getModule`/`getGeometryModule` resolve it) + a `MODULE_SLOTS`
  entry (label/neutral/`filtered`/optional `affectsSize`+`brief`) + its `gen.fieldX` i18n labels.
- **basement/roof modules carry geometry + knowledge** (`basements/`: cellar/crypt/cult-temple;
  `roofs/`: gable/hip): each is a module (label/description/`appliesTo`/`knowledge` + optional
  `build`/`params`/`defaults`/`integrations`/`preview`), surfaced in the composer Details + the gallery.
  A module's logic has two layers: a GENERIC `build()` (runs on any host) and HOST-SPECIFIC
  `integrations[host]` (extra ops layered on only for that structure — e.g. `gable.integrations.house`
  adds gable-end vents). Both run through **`composeModule`** (and **`composeModulePreview`**, which
  gives a roof a host wall box) — the same palette/param machinery as a structure type, via the
  refactored `makePalette(defaults, …)`. This powers the **gallery 3D preview** for roofs + basements.
  A selection ALSO rides into the prompt as a plain-language `[Build details]` line and loads ONLY
  its knowledge guide (no `keywords`, so an unused roof/basement guide never bloats the prompt), gated
  by `appliesTo` (`selectedGuides` skips a roof guide that doesn't fit the chosen structure).
- **`appliesTo` is REQUIRED on every roof/basement/room module** (those contracts narrow ModuleMeta's
  optional `appliesTo` to required), so a module must always declare which structures it fits — never
  silently apply to all. The entries are structure-type ids AND/OR GROUP ids (`domain/groups.ts`):
  `['house']` is the whole family in one tag (gable, flat, the basements, the rooms), while a
  deliberate narrowing lists ids (hip skips sakura; the attics are classic-only; the yards split
  modern vs the rest). It's a GROWING link: a future structure type reuses an existing module by
  joining a group or having its id added (e.g. a `tower` getting a `crypt` basement →
  `crypt.appliesTo = ['house', 'tower']`). `moduleAppliesTo` then shows it in the tower's
  Details + loads its guide. (Decorations + structure types don't use `appliesTo` — a decoration crosses
  with every structure.)
- **A structure type DELEGATES roof/basement geometry to those modules** (the modules are the single
  source — no parallel roof/basement geometry in the type). The type OWNS placement and calls the
  `composeModule(category, id, from, to, extra?)` delegate injected into its `BuildArgs` (built by
  `composeStructure` via `makeModuleComposer`, which runs the module's `build()` + host
  `integrations[host]` through the shared `runModuleGeometry`). The house delegates its roof
  (gable/hip, threading the seeded ridge as `extra.ridge`; the gable's host vents now ride along) and
  its below-grade level (to the `cellar` module, forced `shape:'rect'` to fill the footprint).
  **Palette strategy is per-category by design:** a **roof** reuses the HOST palette (it's part of the
  host's exterior material story — the house's spruce trim), a **basement** gets the MODULE's own
  palette (a cellar is a self-contained stone space, independent of the host's walls). The house keeps
  `roof`/`basement` in its param spec (`roof`: auto/gable/hip; `basement`: none/full/half = burial
  depth + the 'half' clerestory), marked `module:'roof'|'basement'` in `ParamDef` so `paramFields`
  hides them from the house's own Details controls (no duplicate). **Add a roof/basement:** new file +
  register in its `index.ts`; give it `appliesTo` + optional `build()`/`integrations` + a
  `knowledge/nbt/modules/{roof,basement}/<id>.md`.
- **`room` modules are GUIDANCE-ONLY interiors** (`rooms/`: living/kitchen/library/bedroom/dormitory/
  storage): each is a `RoomModule` (`ModuleMeta` + required `knowledge` + `presets` — no `build`/`preview`),
  authored via the **`defineRoom` factory** (`rooms/define.ts`) so a room file is PURE DATA (id/label/
  description/presets) and the factory fills the boilerplate ONCE: `category:'room'`, the knowledge path
  (`nbt/modules/room/<id>.md`, derived from id so it can't drift), each preset's id (`<id>-<scale>`,
  derived from its tier), and the default host link (`['house']`, override to reuse on more structures).
  The user assigns up to two rooms PER FLOOR in the composer Details (shown for a storeyed structure, i.e.
  the house's `floors` param). The picked room ids ride along in `BuildSelection.rooms` (deduped) so each
  loads ONLY its own knowledge guide, and the per-floor layout is folded into the prompt as a `[Room plan]`
  line per floor (`buildRoomPlan` in `renderer/generation/brief.ts`). The AI furnishes each storey from those
  guides (partitioning a floor with two rooms into real, separated spaces). No geometry, so no gallery preview
  (the gallery lists them with their description + `appliesTo` + their FURNISHING PRESETS). Each room guide is
  HOST-AGNOSTIC and carries ONLY this room's furniture vocabulary — the scale/preset/decoration mechanics live
  in the always-on core guide `14-furnishing-by-space.md`, so a room guide never repeats it (no wasted tokens).
  **Add a room:** new `defineRoom({...})` file in `rooms/` + register in its `index.ts` + a
  `knowledge/nbt/modules/room/<id>.md` guide + `presets` (one per scale tier). `appliesTo` defaults to ['house'].
- **`surroundings` modules wrap the shell in a code-built YARD** (`surroundings/`: modern,
  garden): a required single-select slot defaulting to **None**. The user's W×D stays the
  BUILDING SHELL — a pick grows the compiled box by the ring margins. By DEFAULT those auto-scale
  with the house (`SURROUND_SCALE` in `shared/domain/surroundings.ts`: base→max, bigger shell =
  wider ring), but the composer's YARD-SIZE steppers let the user OVERRIDE them with explicit
  per-side cell margins (`SurroundSizing {side,front,back}`); `resolveSurroundMargins(id,w,d,override?)`
  is the single resolver. The renderer's `buildBoxSize` expands via `expandSizeForSurroundings`
  (honouring the override) and the main-side inset uses `surroundMarginsForOuter(id,W,D,override?)`
  — an override is used directly (house = outer − override), else the auto expansion is inverted
  exactly — so the two can't drift (the override rides through `BuildSelection.surroundSizing` →
  shell-seed → `BuildArgs.surroundSizing` + `floors()` + the module). The host structure
  lays its massing in `insetHouseBox(...)` and
  delegates the ring via `composeModule('surroundings', …, {surroundSizing})` (module-respect verified) — every
  host's `build()`/`floors()` opens with the shared `yardFor` so massing and storey math agree.
  The ring is landscaping (≤3 cells tall — the lamp-post lantern cap — open-air, persistent
  leaves) and ships with the seeded shell, so it's LOCKED like the rest of the exterior; the
  model only adds outdoor detail (its knowledge guide spells the rules out). Every house type
  is `seedShell` now, so the ring always ships inside a compiled, locked shell, and the
  central-basement descent ladder targets the INSET house box so it never lands on the lawn.
  Designed for in-world placement by a mod: the yard carries its own ground layer, so pair the
  structure with `terrain_adaptation` (beard) at worldgen — true terrain conformity is a worldgen
  concern, not an NBT one. Both yards clip their lawn to the SEEDED chamfered outline
  (`surroundings/outline.ts`), so the grounds are never the plain rectangle. **Add a surroundings
  module:** new file + register in its `index.ts`,
  a `SURROUND_SCALE` entry, `appliesTo` + each host structure declares the `surroundings`
  param value, + a `knowledge/nbt/modules/surroundings/<id>.md` guide.
  `modern` (hosts: modern) = pool terrace + entry walk + chamfered hedge + planters; `garden` (hosts:
  classic/farmhouse/sakura/gothic) = the cottage homestead yard — cobble + oak-fence perimeter
  with SEEDED chamfered corners (the outline varies every build), stone lamp posts, a
  double-door gate aligned with the door, dirt walk + house loop path, facade flower beds, and
  seeded fountain/well/crop-plot/parterre features (uses the `path`/`soil`/`crop`/`flower` roles).
- **Seeded archetypes — code-built shells the AI only FINISHES** (`structure-types/`: ALL FIVE,
  classic included): the fix for "the style keeps coming out as a wooden pitched box." A
  fresh AI build invents 100% of the geometry, and the model's strong rectangular-house prior overrides
  any advisory guide text — so styles the model can't reliably invent are NOT guidance; they're STRUCTURE
  TYPES that OWN their massing in code. Each archetype's `build()` emits its silhouette: **modern** =
  stacked offset white-concrete volumes, glass curtain walls with dark mullions, set-back upper floor +
  railed roof terrace, FLAT roofs by default but it HONORS the Roof slot (a `roof` param flat/gable/hip,
  marked `module:'roof'` like the house's; gable/hip cap the upper volume with a low white-quartz pitch and
  `modernRoofReserve` keeps the height for it; gable/hip `appliesTo` now include 'modern', and the modern
  decoration's `roof` role is a stairs material — the flat default uses `ceiling`/`trim`, so it's unchanged);
  **farmhouse** = L plan + cross-gable + veranda/gallery; **sakura** = a pink
  cherry cottage RAISED on a VISIBLE stone-brick basement, the entry up on the raised floor reached by an
  exterior stone stair under the overhanging upper storey, a pink cherry-stair roof crowned with blossom
  cascades + an upper balcony; **gothic** = a black-with-white-detailing manor (pale belt courses) with a
  central frontispiece tower projecting at the front and rising past the ridge (carrying the grand entrance),
  a balustraded front veranda, a mini corner tower past the roofline, a glass chapel wing down one side + ivy
  garlands over the eaves, steep slate roof. Each declares its identity decoration as `pairedDecoration`
  on the MODULE (the composer auto-pairs it from the catalog — no hardcoded map); the classic's is cozy.
  - **`seedShell: true`** (`StructureType`) makes a FRESH build SEED the model with this type's compiled
    shell instead of leaving it free-form: `ai/shell-seed.ts` compiles the shell (a `template` op at the
    requested `BuildSelection.size` + decoration) → temp `.nbt` → `readAuthoring` → `shellPreamble`
    (`ai/seed.ts`: "KEEP this exterior, furnish the interior, don't re-roof/re-clad it"), injected in
    `generate.ts` only on turn one of a fresh session. So the user gets a guaranteed silhouette and the
    model only finishes it. EVERY house type seeds — the classic included: its run-to-run variety
    comes from the shell's own seed (window rhythm/corners/roof form/chimney side), not from
    free-form. Free-form remains the path for a build with NO structure selected.
  - **Every seeded shell is LOCKED** (no separate flag — `seedShell` implies the lock): a seed is only
    CONTEXT the model can ignore, and it does — it deletes the ground-floor slab + strips the roof (the
    "sem chão / sem telhado" defect) or emits a furniture-only delta that "keeps" the exterior by not
    re-emitting it, so the whole shell vanished (the sakura "skeleton" defect — v1 was 1.3k blocks of
    carpets/barrels in a 45×69×24 box). `buildShellSeed` returns the compiled shell's solid cells as
    `lockCells`; `generate.ts` threads them into EVERY emit's compile (`CompileOptions.lockCells`), and the
    `preserveShell` pass restores any the model deleted. The exterior becomes code-OWNED (floor/roof/walls/
    tower can't be gutted) while the model still furnishes the interior + may redecorate (solid→solid) and
    glaze walls (a hole→pane is solid, so it's kept). (Door note: gothic's central tower carries the
    entrance, so the portico colonnade/veranda must skip the tower's central bay or a column buries the door.)
  - **The emit COLLAPSE GATE** (`emit-handler.ts`) backs the lock generically, covering free-form
    (no-structure) builds too: a non-`patch` emit whose post-pass solid count falls below HALF of the baseline (the last
    accepted version's `session.lastSolids`, or the locked shell's cell count on the first emit; baselines
    under 50 blocks don't gate) is REJECTED back to the model — it never becomes a version — with feedback
    explaining that a "full" emit replaces the whole structure and to re-emit complete or use mode `patch`
    (air fills in a patch remain the legitimate demolition path).
  - **Verify a shell visually with `BW_CAPTURE`** (compile a `template name:'<id>'` to `.nbt`, open it) —
    the geometry is real code, so screenshot it BEFORE relying on an AI run (which can't be verified
    locally). `domain/__tests__/compose.test.ts` also guards that each archetype compiles from its preview.
  - **Add a seeded archetype:** new structure type with `build()` + `seedShell: true` + register in
    `structure-types/index.ts` + a `knowledge/nbt/modules/structure/<id>.md` guide.
- **SPACE × DECORATION — furnishing presets scale the interior to the floor** (`shared/domain/
  furnishing.ts` + each room's `presets`): the fix for the "big room comes out empty" defect (a huge
  shared bedroom with two beds adrift). Every room carries a small library of FURNISHING PRESETS, one per
  space tier (`RoomScale` = snug / standard / grand, banded by interior floor area in `SCALE_TIERS`). A
  preset is a decoration-AGNOSTIC and host-AGNOSTIC base layout — it names furniture semantically (a hearth,
  a seating cluster, a wardrobe run) and the host structure's decoration (cozy/haunted) re-skins it into
  blocks + mood, so no N×M data (and the same room reuses across structures — house today, tower/… later). `buildRoomPlan` computes each room's area (the build's interior footprint split by the
  rooms sharing the floor), picks the matching tier (`scaleForArea`) + preset (`presetForScale`), and folds
  the tier's density steer + the preset's furniture zones into the `[Room plan]` brief — telling the model
  to build that layout, scaled to the room, in the chosen decoration. The model-facing principle lives in
  the always-on core guide `knowledge/nbt/14-furnishing-by-space.md`; the gallery (`ModulesModal`) lists a
  room's presets as an expandable, scale-chipped list (surfaced via `ModuleSummary.presets`). The scale
  thresholds + the `FurnishingPreset` shape live in `shared/domain/furnishing.ts` ONCE, so the renderer
  brief and the main domain can't drift.
- **Consumers** (all via the `domain/` barrel): `authoring/ops/index.ts` (`composeStructure`),
  `authoring/validate.ts` (`isKnownStructure`/`knownStructureNames`), `ai/generate.ts`
  (`composeBlockNames`), `ai/knowledge-select.ts` (`selectedGuides`/`promptGuides` — selection→
  guide mapping), `main/ipc.ts` (`listModuleCatalog` for the composer/gallery + `buildModulePreview`
  via `catalog/module-preview.ts` for the gallery's 3D preview). Model-facing guides:
  `knowledge/nbt/13-templates.md` + the per-module guides under `knowledge/nbt/modules/`.
- **Future:** `Decoration.furnish()` is a defined-but-unused extension point for furniture ops.

### AI structure generation

File ▸ New Structure opens a chat (`NewStructurePanel`) that generates `.nbt`s. Generation is
**provider-agnostic** (`src/main/ai/`): `generate.ts` owns everything backend-neutral — sessions, the
`emit_structure` handler that validates + compiles the authoring JSON (`structure/authoring/`) to a
versioned scratch `.nbt` (hidden under `<userData>/generated/`, `session.ts`) that is also mirrored into
the user's browsable library as one per-build FOLDER (`<slug>/` with the latest `<slug>.nbt` + kept
`versions/vN.nbt` + a `generation.log`, `output-dir.ts`), the emit→render→**review** loop (screenshots fed back so the model refines
against the prompt/reference, not blind), the round budget, and the live token/phase progress — then
dispatches the LLM transport to a **provider driver** (`providers/`). The shared contract lives in
`providers/types.ts` (`Driver` + `onEmit` + `DriverProgress`); the shared system prompt + tool schema
live in `schema.ts`. Validation errors are returned to the model so it self-corrects in the same turn.

The user picks the **active provider** + model in Settings ▸ AI (`shared/ai.ts` = the registry: id,
label, auth kind, models). There are exactly TWO backends — both **subscription** (an existing CLI
login, no API credits; no raw-API providers, by design — keep the surface + cost story simple):
- **claude-subscription** (stable, default) — the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`):
  authenticates like the Claude Code CLI, runs on the user's **Pro/Max plan**. The SDK manages the
  conversation/tool dispatch/resume; the driver just registers `emit_structure`. The ONLY path with an
  independent critic (`claudeSdkCritique`).
- **codex** (beta) — the Codex CLI (`@openai/codex-sdk`) on the **ChatGPT Plus/Pro** plan. No in-process
  tools: it uses **structured output** for the authoring JSON and takes review screenshots as
  `local_image` file paths. Best-effort; no critic.

Both providers are resumable (`RESUMABLE_PROVIDERS`) — they continue their own server/CLI conversation
via a stored session id (no per-turn re-seed needed). `buildSeed` still seeds a FRESH session from the
open file / shell.

`credentials.ts` resolves auth per provider: env var(s) for that provider win and lock the field
in-app, else an in-app secret (encrypted via `safeStorage` in one blob), else (for subscription
providers) the existing CLI keychain login. Secrets never cross the IPC bridge — only a `configured?`
flag, a masked hint, and the chosen model (`getConfig` → `AiConfig`). `aiAvailable()` reflects the
active provider (subscription = optimistic); a real auth failure surfaces as a clear error on first
send (see `authHint`). Old single-Claude credentials migrate to `claude-subscription` on first read.
- **Generation cost/quality knobs** (`GenerationSettings` in `shared/ai.ts`, persisted in the prefs
  blob via `getGenerationSettings`/`setGenerationSettings`, surfaced in Settings ▸ AI + `AiConfig.generation`,
  edited via `aiSetGeneration`): `maxRounds` (the emit→render→review cap — the #1 cost lever), `thinkingBudget`
  (extended-thinking tokens, 0 = off), `critic` (run the independent audit critic — Claude only). Three
  one-click PRESETS (`GENERATION_PRESETS`: Saver/Balanced/Thorough) set all three; the DEFAULT is **Saver**
  (3 rounds, no thinking, no critic) — deliberately cheap. `generate.ts` reads these per-run (env
  `BW_AI_MAX_ROUNDS`/`BW_AI_THINKING_BUDGET` still override); `maxRoundsFor` honors an explicit budget
  down to 1 (so Saver can stop before the full design-pass sequence — `rounds.ts`).

- **The two AI SDKs are externalized from the Vite main bundle** (`vite.main.config.ts` `external`) and
  loaded via dynamic `import()` inside each `providers/` driver (so a provider's SDK only loads when
  used). The Claude Agent SDK and Codex SDK each spawn a bundled **native binary** resolved relative
  to their own module path, so they must not be inlined. **zod** is external too so the Agent SDK's
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
  (capped at the user's `maxRounds` knob / `BW_AI_MAX_ROUNDS`, default 3 — honored down to 1, so a cheap
  budget can stop BEFORE the full design-pass sequence). The loop is
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
  (claude-sdk `query` with no resume/tools) that judges only the screenshots + checklist and returns
  the failing items — it has no stake in the build, so it catches what the builder rationalizes. The
  critic is OFF by default (it's an extra call) and only runs when the user's `critic` knob is on AND
  the provider is claude-subscription (Codex has none → self-report). `BW_AI_CRITIC_MODEL` can point it
  at a cheaper model. **Extended thinking is tunable** (`thinkingBudget` knob / `BW_AI_THINKING_BUDGET`,
  `0` disables; default OFF under the Saver preset) — when on it plans geometry, and the system prompt
  tells it to plan → emit → review rather than emit immediately. The render round-trip: main calls a `CapturePreview`
  callback (`generate.ts`) → `IPC_EVENTS.aiRenderRequest` to the renderer → `App.tsx` runs `load()` +
  `Viewer.capture()` (synchronous multi-angle JPEGs, downscaled to 512 via `REVIEW_SNAP`) → replies on
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
  to, params }` expands a structure type × decoration (`structure/domain/`) into ops at compile
  time, so the model stands up a whole building shell in ~5 lines and then layers its own ops on
  top. Documented for the model in `knowledge/nbt/13-templates.md`; block-name params (per-role
  overrides) are validated against the real content pack in `generate.ts` (templates intern their
  own palette, so those names never reach `palette`).
- **Build details (modules):** `NewStructurePanel`'s composer has a "⚙ Details" section with
  registry-backed selects — **Structure** (classic, modern, farmhouse, sakura, gothic), **Decoration**
  (cozy/haunted/modern/farmhouse/sakura/gothic), **Roof** (gable/hip/flat), **Basement** (cellar/crypt/
  cult-temple), **Attic** (storage/bedroom) and **Surroundings** (none/modern/garden — required
  pick, defaults to None, filtered by the chosen structure's hosts; a non-None pick reveals a
  **Yard size** control — manual Width-X / Depth-Z cell steppers (2-cell steps) — and EXPANDS the
  compiled box beyond the user's W×D shell via `buildBoxSize`, the composer size fields keep
  SHELL semantics) — plus, for a
  storeyed structure (a `floors` param) the build size is ALWAYS sized PER FLOOR (one height per
  storey, link-toggle to move them together — no "Total" mode) and a **per-floor room editor**: one
  row per floor with up to **two**
  room selects (living/kitchen/library/bedroom/dormitory/storage), capped by `ROOMS_PER_FLOOR`. The picks
  are folded into the prompt as a plain-language "[Build details]" brief — incl. a `[Room plan]` line per
  floor (`buildRoomPlan`) — (never a `template` op; a picked structure type seeds its compiled shell
  instead, see "Seeded archetypes"; cleared after sending), AND ride along as a structured
  `BuildSelection` (`structureType`/`decoration`/`roof`/`basement`/`attic`/`surroundings`/`surroundSizing`/`rooms`/`size`/`floorHeights`, the rooms deduped across
  floors) so the system prompt loads only those modules' knowledge guides — one guide per pick (threaded
  `aiGenerate → generateStructure → systemPrompt → loadKnowledge`), and `size` lets a seeded archetype
  compile its shell at the right box. Roof/Basement are enabled once a structure is chosen and are FILTERED
  by the chosen structure's `appliesTo` (a module that doesn't fit is hidden; switching structure clears an
  incompatible pick + the room rows, and auto-pairs the structure's declared `pairedDecoration`) — both the
  renderer's Details filtering and the main guide gating call the SAME pure `moduleAppliesTo`
  (`shared/domain/applies-to.ts`), so the two can't drift. The selects are
  registry-backed: the composer fetches the categorized module catalog once via the `generationCatalog`
  IPC channel (`listModuleCatalog` from `structure/domain`), so they grow as the registries do. A
  "Modules" button (+ a link in Details) opens the **Module Gallery** (`ModulesModal`): categories
  (Structure/Decoration/Basement/Roof/Room) with a description, the `appliesTo` link ("Applies to:
  House"), and a live 3D preview per module (`previewModule` IPC → `catalog/module-preview.ts`) — roofs
  + basements render their geometry (`composeModulePreview` gives a roof a host wall box); `room`
  modules are guidance-only (no geometry) so they show "Preview coming soon".
- **Chat output is a build card, not raw brief text:** the long "[Build details]" block goes ONLY to
  the model — the chat instead shows the user's words plus a presentable `BuildCard` (`ChatMessage.build`,
  a `BuildBrief` of human LABELS). Two cards share that component: the USER message gets a PREVIEW card of
  the picked modules (structure, decoration/roof/basement chips, size, per-floor room table); the ASSISTANT
  message of a finished build gets the COMPLETE result card — the same module summary PLUS the prompt,
  version, block count, and **Open/Reveal actions** for the saved library file (`build.libraryPath`, threaded
  out of `generateStructure` → `GenerateResult.libraryPath`). The complete card shows even for a plain prompt
  with no Details. `openLibraryFile` (wired by App via `setFileOpener` → `useDocumentFlow.openFile`) opens the
  library `.nbt` as a normal document; Reveal calls `revealPath` on its folder. `runGeneration` takes a
  `GenerationInput` that keeps `aiPrompt` (model) separate from `userText` + `build` (chat). The assistant
  `meta` footer keeps only the run cost (time + tokens) — version/size/blocks live on the card now.
- **Floor plan (`▦ Floors`):** the composer's "Floors" section lets the user define named vertical
  levels (`FloorDef` = `{id,name,from,to}`, an inclusive y range — `normalizeFloor` migrates legacy
  `{y}` records). They live on the Document (`state/documents.ts`, `setFloors`) and persist with the
  chat history (`ChatRecord.floors`, written eagerly via `persistDoc` on every edit), so — unlike the
  one-shot Details brief — they ride along as a `[Floor plan]` context block on **every** prompt
  (`buildFloorPlan` in `renderer/generation/floors.ts`, re-exported by `state/generation.ts`; appended
  to `promptText` only, never the visible
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
  (chest/bed/banner/skull/decorated-pot). Each builds `ResolvedModel`s directly. **Add a new kind as its own file**
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
- **JSDoc convention:** a function with **≥4 positional params, or non-trivial branching /
  multiple return shapes** carries explicit `@param`/`@returns` (and `@throws` where it
  matters) — e.g. `composeStructure`/`composeModule` (`domain/compose.ts`), `mergePatch`,
  `validateEmit`. A function that takes a single well-typed **options/params object**
  documents the FIELDS on that interface (e.g. `GenerateStructureOptions` in `ai/generate.ts`,
  `DriverParams`/`CritiqueInput` in `ai/providers/types.ts`), not as a redundant `@param`.
  Self-evident one-liners keep the lighter prose-comment style used throughout. Prefer an
  options object over a long positional list for anything that keeps growing.
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
  (persisted). The native **View** menu
  shows/hides each window and offers Layout ▸ Reset Window Positions; `App.tsx` reports
  `{visible,available}` per window to main (`reportWindows`) so the menu's checkmarks/enabled state
  track the renderer (which owns the state). Don't inline window positions — go through the store.
- **Console dock:** a `WindowId` like the others, but it's the **full-width bottom dock** (not a
  sidebar tab or floating window), so — like `controls` — it tracks visibility only (plus a persisted,
  resizable `consoleHeight`) and is NOT a `PanelId`. App.tsx wraps the stage row + `ConsoleDock` in a
  `.stage-area` column so the console spans the full width (under the sidebar) while the stage shrinks
  (the WebGL canvas resizes instead of being covered). Toggled from View ▸ Console (Cmd+Shift+K); the
  `onToggleWindow` handler treats `console`/`controls` as plain visibility toggles (no `openPanel`).
  It shows BOTH processes' `console.*` output (see `main/logger.ts` + `state/logs.ts`) so packaged
  builds — with no terminal — stay inspectable. The View menu also opens the Block Catalog
  (Cmd+Shift+B) + Module Gallery (Cmd+Shift+M) modals via their own divider group (they're modals,
  not window toggles, so they `notifyOpenCatalog/Modules` → `store.setCatalogOpen/ModulesOpen`).
- **Home / tabs:** `activeId === null` (documents store) is the **Home** state — the Welcome screen
  shows whenever there's no active doc, even with tabs still open. The title-bar **House icon**
  (`TabBar`, `goHome()`, a lucide `House`) returns there; clicking a tab
  restores it. The Generate dock tab has no close button (close it from View ▸ Generate, like
  Info/Versions). A brand-new tab (the "+" / File ▸ New / Welcome ▸ Generate) lands on the inline
  NewBuildPanel (Details-first), NOT the chat dock — `newDoc` resets the planner draft + does not
  force the dock open; `build()` reveals the chat once generation starts.
- **Icons:** the UI uses **lucide-react** (modern stroke icons) — import the named icon directly
  (`import { House } from 'lucide-react'`). Diagrams in the Guide are inline SVG themed via
  `currentColor` + CSS vars (the `gd-*` classes). Help ▸ Guide (`Cmd+Shift+/`) opens GuideModal via
  `notifyOpenGuide` → `IPC_EVENTS.openGuide` → `store.guideOpen`.
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
