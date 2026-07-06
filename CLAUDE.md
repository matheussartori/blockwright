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
                          + Help ▸ Check for Updates…
    updater.ts            Update strategy, two layers wired by initAutoUpdates at launch: Squirrel
                          auto-install (update-electron-app) + a notify-only GitHub-release check
                          (update-check.ts). Details + the BW_FORCE_UPDATE_CHECK dev hatch under
                          "Updates" below.
    update-check.ts       The notify-only GitHub Releases API check (see "Updates" below).
    update-version.ts     Pure semver-ish compare (`isNewer`/`parseVersion`) — no electron import so
                          it's unit-testable (update-version.test.ts).
    recents.ts            Persisted "recently opened" files (last 10) in userData
    recent-workspaces.ts  Persisted "recently opened" mod workspaces (last 10) in userData
    workspace.ts          Mod-workspace detect/apply (+ detect-from-.nbt, activate a known one,
                          listWorkspaceStructures/listWorkspaceBiomes for the export dialog)
    texture-protocol.ts   Custom bw-texture:// privileged scheme serving namespaced PNGs
    export/               Writing a structure out. worldgen-json.ts (pure builders: jigsaw structure def /
                          template_pool / structure_set / has_structure biome tag; `singleElementPoolJson` +
                          a parameterized `structureJson` size/max_distance back the SPLIT assembly) +
                          index.ts (the WORKSPACE export — planExport = live preview of the files +
                          problems; runExport = write them) + local-export.ts (the NON-workspace exports:
                          `exportStructure` = "Export As…" a user-chosen file/format, `exportToWorld` =
                          install a ready-to-run datapack into a MC save + teach the `/place` command) +
                          write-split.ts (`writeSplitFiles` — the one mkdir+write loop every path shares).
                          See "Export to mod workspace" + "Oversized structures → jigsaw split" below.
    structure/              Grouped by responsibility (one subdir per concern):
      io/
        raw.ts              The format-NEUTRAL `RawStructure` shape ({size,palette,blocks,blockEntities?,entities?})
                            + RawPaletteEntry/RawBlock/RawBlockEntity/RawEntity + `blockStateString` + `omitKeys`. Every
                            codec decodes to / encodes from this; kept in its own module so no codec owns the
                            shared contract (load-structure + schematic re-export for back-compat).
        split-structure.ts  `splitToJigsaw` (main): cut an oversized `RawStructure` into a JIGSAW assembly that
                            reassembles voxel-perfectly. A `JigsawSplitter` class (mirrors jigsaw-assembler's
                            `Assembler`) slices pieces, picks seam cells off block entities, injects connectors
                            whose `final_state` restores the seam, partitions block entities + entities per piece,
                            and asserts the geometry round-trips through `solveAttachment`. See "Oversized
                            structures → jigsaw split".
        data-markers.ts     `extractDataMarkers`: data-MODE structure blocks → {pos, metadata string}
                            on `StructureData.dataMarkers` (a mod's spawn/trigger hooks — the one other
                            block-entity NBT read besides jigsaws). The Inspector lists them first,
                            grouped BY STRING (mono + "data" chip + copy button + focus jump).
        nbt-tags.ts         Shared NBT tag builders (int/str/compound/compoundList/longArray/xyz/longFromMs…)
                            + `createPaletteInterner` — the helpers the `.schem`/`.litematic` encoders had
                            copy-pasted verbatim, now declared once.
        load-structure.ts   Parse .nbt (prismarine-nbt) → StructureData (extension-aware: a `.schem`/`.litematic`
                            decodes via its codec). `buildStructureData` = the raw {size,palette,blocks}
                            → resolved StructureData step, shared by every source format.
        schematic.ts        Sponge `.schem` (WorldEdit) interop: decodeSchem (v2/v3, varint-packed) +
                            encodeSchem (v2) + parseBlockState. Decodes to the SAME raw shape as `.nbt`
                            (from raw.ts/nbt-tags.ts). See "Schematic interop".
        litematica.ts       Litematica `.litematic` interop: decodeLitematic (multi-region, bit-packed long
                            array, SPANNING) + encodeLitematic (single region). The BigInt long-array
                            packing lives in `long-bits.ts` now (imported here + by the world decoder).
        long-bits.ts        Shared BigInt long-array bit-packing (SPANNING + NON-spanning): bitsForPalette/
                            bitsForBlockStates + pack/unpack + pairsToBig/bigToPairs (prismarine-nbt's
                            [hi,lo] int32 pairs ↔ unsigned bigints). Unit-tested (`__tests__/long-bits.test.ts`);
                            consumed by `.litematic` (spanning) AND the Anvil chunk decoder (world viewer).
        convert.ts          Format-aware export: readRaw (.nbt|.schem|.litematic → raw) + convertStructure
                            (writes by the dest extension; .nbt→.nbt copies losslessly, else re-encodes). Export As.
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
        entity.ts            Project the raw `entities` (armor stands, item frames, mobs — NOT
                             blocks, so no palette entry) into render-ready `StructureEntity`s:
                             id/pos/yaw/fallback-color/resolved-texture-key + armor-stand display
                             flags & `Pose`. `resolveEntities(raw, canResolve)` (canResolve gates
                             the armor-stand texture disk check); the viewer draws the result (see
                             renderer `viewer/entity-mesh.ts`).
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
        groups.ts          STRUCTURE_GROUPS — the structure FAMILIES ('house', 'tower', 'church'). Every
                           structure type declares `group`; a module's `appliesTo` can name the GROUP id
                           to pair with the whole family at once (`moduleAppliesTo` resolves the host's
                           group); the UI headers the gallery rail + the structure Select by group.
        roles.ts           Semantic block roles (wall/floor/roof/…) + BASE_BLOCKS fallback + isRole
        params.ts          ParamSpec/ParamDef + resolveParams + paramFields (single per-type param decl)
        compose.ts         composeStructure (THE cross) + composeBlockNames + isKnownStructure
                           (decoration param accepts `decoration` or legacy `theme`)
        compose-basement.ts The central-basement machinery split out of compose.ts:
                           selectedBasement/basementHeight (re-exported via compose.ts) +
                           composeBasementStack (the multi-level below-grade stack every seeded
                           archetype's central basement path runs through)
        index.ts           barrel + catalog (listModuleCatalog), selection→guide mapping
                           (selectedGuides/promptGuides), buildModulePreview (gallery)
        shell-kit.ts       The shared house-shell PARTS kit (like stair-core: a parts kit, not a base
                           class): roofFormFor/roofCap (the ROOF GUARANTEE — a pitched pick that can't
                           fit or can't pitch still caps with the flat module, never roofless),
                           storeyEntries (ladder → authoritative FloorPlanEntry[]), seatDoor,
                           cornerPosts, storeySlabs, ceilingLanterns. Every code-built type composes its
                           casco from these (the tower keep reuses the storey/door/light parts and adds
                           its own crenellated crown); per-type code is only the genuine identity geometry.
        structure-types/   Category "structure": one file per archetype, ALL SEEDED with code-built
                           shells. Type ids are FORM-DESCRIPTIVE (the silhouette — the theme lives in
                           the paired `decoration`): the 'house' GROUP = cottage/villa/farmhouse/
                           raised-cottage/manor; the 'tower' GROUP = keep/spire; the 'church' GROUP =
                           church. Legacy ids (classic/modern/sakura/gothic/tower-classic/haunted-tower)
                           still resolve via LEGACY_ALIASES in index.ts so saved builds keep working.
                           Each archetype's silhouette, paired decoration and module links are described
                           ONCE under "Seeded archetypes" below. + types.ts (contract: Box/logProps +
                           `seedShell`/`pairedDecoration`/`complex` + `floors()`) + stair-core.ts
                           (addStairCore — the shared switchback stair core every code-built type lays,
                           taking the build's RolePalette; a `parts` helper, no cross-type imports — its
                           flights are INSET one cell from the far wall so the global stairwell pass can
                           seat their landings) + crown.ts (the shared tower-crown parts kit:
                           walkPerimeter/crenellations/roofHatch/arrowSlit — keep and spire compose
                           their battlements/hatch/slits from it instead of duplicating the perimeter
                           walk) + farmhouse-parts.ts (farmhouse-only pieces) + index.ts (registry +
                           LEGACY_ALIASES). shell-kit also carries roofStair(palette, facing) — the
                           one-liner for a bottom/straight roof-stairs palette entry. A type emits ops
                           in terms of roles (never concrete blocks), composes its casco from shell-kit
                           parts, keeps ONE `plan()` feeding both `build()` and `floors()`, and
                           delegates roof/basement to modules.
        decorations/       Category "decoration": one file per look (cozy/haunted/modern/farmhouse/sakura/
                           gothic/castle/chapel/cursed — castle = a UNIVERSAL dressed-stone/masonry look, the
                           keep's default; chapel = whitewashed plaster (smooth quartz) over dressed stone +
                           a steep dark deepslate roof, the church's default (Castle is the grey-stone
                           alternative); cursed = the dark-stone gothic-RUIN palette (blackstone shaft, mossy
                           footings, soul flame), the spire's default + the stone counterpart to haunted) +
                           types.ts (Decoration contract) + index.ts (registry,
                           DEFAULT_DECORATION='cozy'). A decoration maps roles→blocks + decay + weathering.
        basements/ roofs/  Categories "basement"/"roof"/"attic": one file per typology (roof: gable/
        attics/            hip/flat; basement: cellar/crypt/cult-temple; attic: storage/bedroom)
                           + types.ts + index.ts (registry) each. Geometry + knowledge modules,
                           selectable in the composer Details and listed in the gallery; the two-layer
                           `build()`/`integrations` model, the palette strategy and the host delegation
                           are described ONCE under "basement/roof modules carry geometry + knowledge"
                           in the domain section below.
        rooms/             Category "room": one file per interior program — the 'general' family
                           (living/kitchen/library/bedroom/dormitory/storage) + the 'horror' family
                           (ritual/dungeon/morgue/seance) — each a `defineRoom({...})` of PURE DATA +
                           define.ts (the factory: fills category/knowledge-path/preset-ids + default
                           hosts + the `group`, default 'general') + types.ts (RoomModule = ModuleMeta +
                           required `knowledge` + `presets`, no geometry) + index.ts (registry, general
                           first then horror so each group's options stay contiguous for the grouped
                           picker). Room program groups live in `groups.ts` `ROOM_GROUPS` (general/
                           horror), merged with `STRUCTURE_GROUPS` into the catalog's `groups` so the
                           renderer resolves either id to a label; the per-floor room picker (FloorStack)
                           is a grouped, searchable `Select`. GUIDANCE-ONLY (no geometry) + FURNISHING
                           PRESETS tiered by floor space — the behaviour is described ONCE under
                           "`room` modules" + "SPACE × DECORATION" in the domain section below.
        surroundings/      Category "surroundings": one file per yard typology (modern, garden,
                           graveyard) + types.ts (SurroundingsModule, required `appliesTo`) +
                           yard-features.ts (the shared yard scaffold garden + graveyard build on:
                           rect helpers + the seeded occupancy/chamfer `yardScaffold`, lampPost,
                           weepingTree/deadTree — modern keeps its own ops-threading style) +
                           outline.ts (the shared seeded chamfered OUTLINE: rimCells/inCut/
                           seededChamfers — the lawn is CLIPPED to it, so the yard's footprint is
                           never the plain rectangle) + index.ts (registry + `insetHouseBox` + the
                           shared `yardFor` every host's build()/floors() opens with). A GROUND-LEVEL
                           landscaping RING laid OUTSIDE the building shell — the sizing model
                           (auto-scale + manual override), the per-yard typologies and the host links
                           are described ONCE under "`surroundings` modules" in the domain section
                           below. Own palette over the decoration (like a basement — a lawn stays a
                           lawn); ring stays ≤3 cells tall (landscaping, never construction — the cap
                           is the lamp-post lantern); leaves placed persistent.
        rng.ts             shared seeded PRNG (mulberry32/seed3)
        footprint.ts       seeded non-rectangular footprints (rect/L/T/U/plus) so a basement isn't always
                           a square box (param `shape`, default `auto`). Tests in domain/__tests__/.
    mc-version-detect.ts   Detect a mod's target Minecraft version from its project files (classic 1.x +
                            year-numbered 26.x strings; pack.mcmeta classic `pack_format` AND the 26.x
                            `min_format`/`max_format` range — number, fractional 107.1, or [maj,min] pair —
                            resolved via nearest-known-format-below)
    structure/mc-data-version.ts  The DataVersion REGISTRY: `DATA_VERSIONS` (1.18.2…26.2=4903) +
                            `dataVersionFor(version)` (exact hit, else NEAREST OLDER — never over-stamp) +
                            DEFAULT_DATA_VERSION (3955 = 1.21.1, the AI path's deliberate pin: its knowledge
                            base targets 1.21.1 and newer games upgrade on load). The ordering + the
                            nearest-older lookup live ONCE in shared/mc-version.ts (`mcVersionRank` — year
                            majors 26+ outrank every 1.x — and `nearestVersionValue`, shared with
                            worldgen.ts `datapackFormatFor`).
    structure/data-version.ts  `activeTargetVersion()`/`activeDataVersion()` — the ACTIVE context's target
                            (workspace → content pack → default); export/convert/save paths stamp through it.
                            Export-to-World is even more precise: it reads the target save's own level.dat.
    file-watch.ts           Watch mode (the worldgen dev-loop): fs.watch the OPEN FILE (renderer registers it
                            via `watch:file`; a change pushes `file-changed` → hot-reload in place, skipped
                            while a run is in flight or the editor holds unsaved edits) + the active
                            workspace's STRUCTURE FOLDER (→ `workspace-structures-changed` refreshes the
                            Project panel). Debounced; best-effort (a watch failure = just no live reload).
    export/doctor.ts        The Worldgen Doctor (File ▸ Workspace Check-Up…): scans the WHOLE workspace data
                            pack — structure defs (spawn_overrides/start-pool/biomes/distance-cap), sets
                            (spacing/separation/dangling refs), pools (empty/dead structure files), biome
                            tags, pack.mcmeta staleness, wrong structure folder, oversized `.nbt`s — into a
                            WorkspaceDoctorReport of coded findings the renderer localizes with fix-its.
                            One `check*` function per RULE over a shared DoctorRun ctx; adding a rule = a
                            check fn + its code in the typed `DOCTOR_CODES` list + `doctor.issue.<code>`
                            strings + a doctor.test.ts case (an i18n guard test fails a code with no string).
                            `doctorWorkspace(ws)` is the testable core (export/__tests__/doctor.test.ts).
    structure/catalog/retheme-map.ts  The one-click decoration re-theme's mapping: block name → role
                            (dictionary annotation first, then guessRole) → the target decoration's block.
                            Pure name→name; the renderer carries the blockstate props through the swap.
    world/                  The World Viewer's MAIN side: read a Minecraft save + resolve chunks to
                            render payloads. See "World viewer" below.
      active-world.ts       The single open-world singleton (mirrors content-pack's active-workspace):
                            open/get/close a WorldSource, disposing the previous one.
      world-service.ts      The API the IPC handlers delegate to: openWorld (activate + meta),
                            getChunkPayload/getChunksPayload (chunk coords → resolved payloads),
                            listWorldRegions, findWorldStructures — composes the singleton + reader + resolver.
      world-source.ts       The lazy, cached world READER (pure data, no asset resolution): opens region
                            files on demand, bounded LRU of region buffers + decoded columns, getChunk /
                            listRegions / findStructures. Version-gated on DataVersion (1.13+ paletted).
      chunk-resolve.ts      Bridge a decoded ColumnData → ChunkRenderPayload via the EXISTING asset
                            pipeline (resolveBlockEntry), memoised by block-state string (a world has
                            millions of blocks but few hundred states); clear the memo on content/workspace switch.
      biome-tint.ts         Per-chunk dominant grass/foliage tint (sRGB) for tintindex faces + the minimap.
      edit-service.ts       The world-EDIT service the IPC handlers delegate to (parallel to
                            world-service for reads): ONE WorldEditSession at a time on the ACTIVE
                            world (open/close/apply — apply maps the IPC-shaped edits, evicts the
                            read caches for edited chunks + neighbors via WorldSource.evictChunks,
                            prunes backups per retention) + the backup list/restore/delete front.
                            Channels world:edit-* / world:backup* in shared/ipc.ts.
      edit/                 The SAFE WRITE path (v2.2 §1) — the only owner of bytes written to a
                            save. world-edit-session.ts (the orchestrator: session lock → per-chunk
                            edit gate → surgical patch → ENFORCED region-granular backup → atomic
                            rewrite → POI invalidation; refused chunks are reported, never
                            "best-effort" written) + nbt-tree.ts (tag-typed helpers — patches work
                            on the parsed {type,value} tree so unowned tags survive byte-for-byte)
                            + section-pack.ts (palette rebuild + non-spanning repack, bits=max(4,…),
                            single-entry omits data) + chunk-patch.ts (block_states/block_entities
                            patch; strips section light, deletes Heightmaps, isLightOn=0 — the game
                            relights/re-primes on load; gate = Status full + 1.18 ≤ DataVersion ≤
                            newest known, DataVersion never bumped; markLightStale for the 8
                            neighbors) + region-write.ts (atomic whole-region rewrite: untouched
                            sectors verbatim, temp+fsync+rename, `.mcc` overflow both directions)
                            + backup.ts (blockwright-backups/<ts>/ sets + manifest, restore/prune)
                            + session-lock.ts (session.lock held for the session; Windows =
                            mandatory ⇒ real mutual exclusion, POSIX = best-effort, surfaced via
                            `lockExclusive`) + poi-invalidate.ts (poi Sections.<y>.Valid=0). Suite
                            in edit/__tests__ (golden no-op byte-identical rebuild, round-trips
                            through the production reader, `.mcc` boundary, synthetic-world
                            integration incl. backup/restore).
        world-paths.ts       isWorldDir / availableDimensions / listRegions / region+chunk path math
                             (vanilla + mod dimensions under DIM/…/region).
        level-dat.ts         Parse level.dat → name/dataVersion/versionName/spawn/player.
        region-file.ts       Open a .mca: read the header, inflate a chunk's NBT, listPresent (for scans).
        chunk-decode.ts      Decode a 1.13+ chunk NBT → ColumnData (sections/heightmap/block entities);
                             handles 1.18+ root `sections` + legacy `Level.Sections`, spanning vs non-spanning.
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
      save-version.ts       Persist a MANUALLY-edited structure (the block editor) as a new `vN.nbt`:
                            re-encode the edited blocks straight via `encodeStructure` — BYPASSING the
                            AI-repair passes so edits are faithful — re-attaching block-entity NBT via
                            each block's `nbtPos` ORIGIN cell (stamped at load, preserved by the editor
                            ops — so a MOVED chest/jigsaw/data-marker keeps its NBT) + entities +
                            DataVersion from the source file, then mirror to the same session scratch +
                            library as AI versions. See "Block editor" below.
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
                            rebuildStairwells (passes/stairwells/ — index.ts is the pass; the pure
                          helpers live beside it: planes.ts = floor-plane detection + houseFootprint,
                          materials.ts, hints.ts = the model's flight/ladder hints, patch-holes.ts =
                          patchOrphanHoles) is the DEFINITIVE circulation pass:
                          always-on + self-gating — it detects the storey FLOOR PLANES,
                          collects the model's flight/ladder hints (which gap each serves), strips the
                          broken geometry, and rebuilds ONE clean connector per gap — a straight stair
                          when a 45° run fits in the interior (full top step reaching the upper floor,
                          opening sized to the run, 2-block headroom, landings) else a flush wall ladder
                          (hung on the shell OR an interior wall). Connectors reserve their cells so two
                          can't collide. Every connector is clamped to the HOUSE FOOTPRINT
                          (`houseFootprint`: the union of the ABOVE-grade storey planes' largest floor
                          component), NOT the raw block bounds — a build with a SURROUNDINGS yard fills the
                          whole box at grade with lawn, so the raw bounds are the YARD and a derived stair
                          used to climb out onto the lawn / a graveyard tree (the "escada no exterior"
                          defect). A gap whose cluttered interior fits neither a stair nor a normal ladder
                          falls to a LAST-RESORT forced wall ladder (`planForcedLadder`): leans on any solid
                          wall like the normal ladder but CARVES non-locked clutter (furniture / a model
                          partition) out of the 1-wide shaft — never a locked wall/roof, and the locked
                          floor DECK is still carvable as the stairwell opening — so a furniture-packed
                          storey (a morgue's cabinets, a dungeon's cells) gets one clean climb instead of
                          being abandoned to the model's broken, DOUBLED stairs. Below-grade gaps are
                          code-owned (the central basement ships ONE descent LADDER); when such a ladder
                          exists the pass STRIPS the model's competing below-grade STAIR flights (never a
                          ladder, so the real descent always survives), so the basement has exactly one way
                          down (the "duas escadas para o basement" defect). Roof
                          slopes (gables of stairs) are excluded via findFlights/topCeilingY — whose
                          roof-vs-floor ceiling is the MAX of the geometric guess and the authoritative
                          top storey plane (`ceilFloor`), so a build with a huge surroundings YARD (whose
                          ground plane dwarfs the small interior floors) no longer collapses the ceiling to
                          grade and drop every real flight as a "roof slope" (the DOUBLE-staircase defect).
      compile.ts          compileStructure / compileStructureReport / writeStructureFile
                          (validate → resolveBlocks → runPasses → encode), each taking optional
                          CompileOptions {structureType}; `pipelineFor(structureType)` assembles the
                          always-on passes + the module's gated finalizers. writeStructureFile
                          returns a CompileReport ({fixes,warnings}) for the generator to surface.
  renderer/                React app (Vite + @vitejs/plugin-react). No Node/fs/electron — IPC only.
    index.tsx             Entry: initTheme() then createRoot(#app).render(<App/>) (no StrictMode — see gotchas)
    App.tsx               Orchestration: the WORKBENCH layout (TabBar / ActivityBar / ProjectPanel /
                          stage / Statusbar) + composition of the app/ hooks
    app/                  The Shell's concerns, one hook per responsibility: useDocumentFlow (open/load/
                          close + workspace-suggest handlers), useAppIpc (native-menu/file IPC wiring +
                          file/window-state report to main), useAiRenderBridge (the self-review render→
                          screenshot bridge), useViewerSync (store→viewer effects), capture.ts (helpers)
    api.ts                Typed accessor for window.blockwright (the preload bridge)
    components/           ActivityBar (the left icon rail: House=Home on top, Project/New-build/Catalog/
                          Modules, then Console/Guide/Settings pinned at the bottom; active surface marked
                          by an accent "voxel pip"), ProjectPanel (the left explorer: active workspace +
                          its structures searchable + recent files/workspaces/worlds; toggled from the rail
                          or View ▸ Project Panel (Cmd+B), width resizable + persisted), FloatingWindow
                          (shared window chrome), Statusbar (left: the active-workspace segment — the old
                          floating WorkspaceBadge, now a status segment that opens the workspace picker;
                          then the structure summary; right: pack state), Welcome (the START PAGE: the
                          hero is a real PROMPT card — typing a description + Generate/Enter lands in the
                          planner pre-filled (the example chips below it fill the field, still editable);
                          the open actions are a quiet 2×2 tile grid; compact recents on the right — the
                          full lists live in ProjectPanel), TabBar (the
                          single slim top bar — no separate titlebar; per-tab doc-kind icon: Box=structure,
                          Globe=world, Sparkles=new build; Home lives on the rail, not in the strip),
                          WorkspaceSuggest, Loading, SettingsModal (tabbed shell; each tab is a component in
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
                          family via `catalog.groups`), plus the size box (per-floor heights with a
                          link/chain toggle — the height model lives in generation/brief.ts below),
                          the YARD-SIZE control when a surroundings ring is picked
                          (the SAME boxed number-stepper panel as the floor heights: Width X / Depth Z in
                          cells, nudged in 2-cell steps) + per-floor rooms), size-controls.tsx (the shared
                          boxed-panel primitives those size sections compose: SizePanel/SizeRow/LinkToggle),
                          ModScopeControl (the off/mix/prefer mod-blocks Segmented + hint, shared by
                          BuildPlanner + CatalogModal), FloorsSection (the ▦ Floors editor), BuildCard (the chat
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
    components/export/    The "Export to mod" dialog, decomposed (orchestrator + view parts, like
                          generate/): ExportModal (orchestrator — owns the live plan + the write +
                          the no-workspace/form/success state switch), ExportConfig (the config column —
                          owns the form state, emits a draft of {name, resourceName, worldgen}),
                          BiomePicker (the mod/vanilla biome source toggle + multi-select), ExportPreview
                          (the file tree + the checks footer), ExportFileRow (one filename+folder row,
                          shared), ExportStates (the empty + success states). See "Export to mod workspace".
    components/editor/    The block editor's UI: EditorPanel (orchestrator — the FAB / tool rail / selection
                          readout / Save·Undo·Redo), ToolRail (the tool icons, ordered by TOOL_ORDER so the
                          1–9 shortcuts match), ToolControls (the active tool's controls — a focused branch
                          per tool), EditorCanvasHint (the on-canvas tool + modifier-keys chip), AxisPad
                          (the ± move/extrude pad), BlockField (block-id autocomplete), DataMetaEditor
                          (the selection-driven "Structure data" field — edit a data-mode structure block's
                          metadata string; see "Block editor"), EditorLayer (the imperative viewer bridge:
                          click-picks a block, paint/void strokes + plane lock + depth wheel, keyboard
                          shortcuts, selection overlay, re-show on edit), useBlockIds (catalog ids for
                          autocomplete). See "Block editor" below.
    components/ui/        Reusable primitives: Modal (overlay+panel shell), Segmented (toggle), Switch
                          (on/off pill toggle), Select
                          (the themed single-select dropdown — portal-rendered in `position:fixed` so it's
                          never clipped by a scrolling column, keyboard-navigable, options carry an optional
                          one-line `description` clamped with ellipsis + the full text on hover; options can
                          also carry a `group` (family) label — each contiguous run gets a header/divider,
                          and the opt-in `searchable` prop adds a sticky search box; the filter preserves
                          order so group headers HOLD while filtering (e.g. searching "cottage" still shows
                          it under "House" then "Tower"); the OPAQUE
                          `--elevated` token backs the menu, never the translucent `--panel`), Tooltip
                          (the hover/focus bubble — the richer replacement for a native `title=`: a bold
                          `label` + an optional one-line `description` of what a control does, portal-rendered
                          in `position:fixed` so the WebGL canvas can't clip it, with a directional caret and
                          flip-when-no-room placement; shows after a hover delay but instantly on keyboard
                          focus, keeps the trigger's `aria-label`, respects reduced motion — wrap one trigger
                          element, no extra DOM box), Logo
                          (the app mark — one squircle artwork, no theme swap), StructurePreview (standalone Three.js scene that frames any
                          StructureData; auto-fits camera), BlockPreview (thin wrapper for one block).
                          Build dialogs/controls from these so fonts/spacing/styles stay consistent. Prefer
                          `Select` over a native `<select>` or a fresh single-select chip group, and `Tooltip`
                          over a bare `title=` when an icon-only control needs an explanation.
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
    editor/               Pure (no-React, no-Three) block-editing ops over {size, palette, blocks}:
                          ops.ts (move/extrude/delete/replace/buildStairs/placeBlock + planTransform
                          [mirror/rotate] + selectBox/cuboidCells/intern, unit-tested) — the geometry rules
                          behind the block editor. Move/extrude preserve orientation for free (they only COPY
                          a block's `state`); mirror/rotate rewrite the directional blockstate via the shared
                          `structure/orientation.ts` (`transformProps`) — the transform WorldEdit never fixed.
                          See "Block editor" below.
    diff/                 The pure structure-diff core: diff.ts `diffStructures(a, b, offset?)` — cell-by-cell
                          added/removed/changed/same + a per-block rollup (air-like entries read as EMPTY;
                          property ORDER can't fake a change), unit-tested in diff/__tests__/. Consumed by
                          state/diff.ts (`compareActiveWith(path,label?)` → store.diff), the viewer's
                          DiffOverlay (mirrored by useViewerSync, auto-invalidated on tab switch / editor
                          activation) and components/DiffPanel (the floating summary card).
    windows/              InspectorWindow / JigsawWindow / VersionsWindow — the three floating windows.
                          Inspector also carries the missing-texture diagnostics line (block types that fell
                          back to flat colors, hover for the list — only when a content pack resolves at
                          all); Jigsaw lists the PLACED PIECES of an assembly (click → open that piece's
                          file in a new tab); Versions has a per-version COMPARE action (diff vs the shown
                          build — "what did this run change?" in one click).
    hooks/useStores.ts    useApp / useSettings / useWindows / useLogs (React bindings over the vanilla stores)
    state/                store.ts (main-mirrored + view state), settings.ts (prefs, incl. theme),
                          windows.ts (floating-window layout + the Console dock visibility/height,
                          persisted), logs.ts (the Console dock store: patches the renderer console,
                          pulls main's backlog + tails its live lines, capped + deduped), theme.ts,
                          documents.ts (the tabbed Documents store: one Document per open `.nbt`/build
                          with its own structure/chat/AI session + the version chain + the `currentVersion`
                          pointer — see "Versions" below), generation.ts (the per-tab AI run loop +
                          hydration), versions.ts (the VERSION CHAIN ops: recordVersion/viewVersion/
                          setCurrentVersion/deleteVersionEntry/commitManualVersion + `currentBasePath`,
                          split out of generation.ts so the panel/exporters/editor share one source),
                          persist.ts (chat/session persistence) + doc-loader.ts (the `loadDoc` bridge App
                          registers — both extracted so versions.ts and generation.ts don't cycle),
                          editor.ts (the block editor: mode/tool/selection/anchor/tool-params + an
                          undo/redo snapshot stack; ops patch the active doc's StructureData; save
                          re-encodes via IPC → a new version; TOOL_ORDER = the rail layout AND the 1–9
                          number-key shortcuts; `retheme(mapping)` = the whole-build palette swap,
                          resolving each target WITH the source entry's blockstate props),
                          diff.ts (compareActiveWith/closeDiff — the compare flow, see diff/ above)
    ui/path.ts            basename/dirname helpers (no Node path across the bridge)
    ui/hash.ts            the renderer's deterministic string hashes, declared once: hashString31
                          (catalog swatch hue) + hashFnv1a (the size-preview's seeded-RNG seed)
    viewer/               Three.js Viewer (scene/lights/loading/render loop) + ViewerProvider (React
                          bridge) + mesh/geometry/texture building. The geometry MATH is a shared,
                          WORKER-SAFE core: geometry-core.ts (buildGeometryBuffers — resolved palette +
                          blocks → per-material transferable vertex buffers, with optional neighbour
                          face-culling for the world path; `packBuffers` freezes an accumulator's arrays
                          into a MaterialBuffers ONCE, reused by the world's surface-LOD mesher) +
                          model-geometry.ts (addModel/addFallbackCube — pure quad math, THREE math only,
                          no scene/texture). mesh-builder.ts then WRAPS those buffers into
                          BufferGeometry+Material+Mesh where it has the real GPU textures (geometryFor/
                          materialFor, shared by the structure path + world chunk assembly); the world
                          chunk-mesh worker calls the SAME core, so the two renderers can't drift (a
                          golden test pins the structure output).
                          entity-mesh.ts for `StructureData.entities` — the vanilla armor-stand box
                          model textured from the entity atlas with `Pose`/flags applied, else a
                          fallback cube, added per-piece alongside the block group. Focused concerns
                          split out of the Viewer class: camera-controller.ts (CameraController — the camera + orbit/fly
                          navigation + framing), world-mode.ts (WorldMode — the world-mode facade: owns
                          the WorldView lifecycle, day/night lighting, HUD stats/minimap, goTo/framing;
                          the Viewer's world methods are thin delegates), dispose.ts (disposeObject —
                          the ONE traverse-and-dispose helper every scene teardown uses: viewer clear,
                          world chunk eviction, the preview components, floor-regions),
                          capture.ts (the AI-review screenshot paths: orbit/
                          cutaway/section — encoded via the shared `REVIEW_SNAP` = JPEG@512 to keep the
                          re-sent/accumulating review images cheap; cutaways scale ~1/storey and yield 0
                          for a shallow single-volume build the section already reveals), floor-regions.ts
                          (FloorRegionsOverlay — the floor-plan
                          bands), highlight.ts (FocusHighlight — the inspector focus box),
                          selection-overlay.ts + symmetry-overlay.ts + void-overlay.ts + hover-overlay.ts
                          (SelectionOverlay = the block editor's outlined+filled selection boxes;
                          SymmetryOverlay = the live mirror plane; VoidOverlay = occluded wireframe markers
                          over the solid-adjacent air/structure_void cells; HoverOverlay = the single
                          paint/place preview cube) — all extend scene-overlay.ts (SceneOverlay, the shared
                          scene/group/clear lifecycle) and read overlay-colors.ts (ACCENT/FOCUS/AIR_MARK
                          [blue]/VOID_MARK [red], mirroring Minecraft's show-invisible-blocks colors). The Viewer also exposes `pickBlock(x,y)`
                          (raycast → block cell, via stepping along the ray) + `pickPlacement(x,y)` (empty
                          cell in front) + `setSelection`/`setSymmetryPlane`/`setVoids`/`setHover`/`setPaintNav`.
                          The Viewer's WORLD-MODE surface (enter/exitWorldMode, setWorldDimension/
                          RenderDistance, setDaylight, worldStats/Minimap, goToWorldCoord) delegates to
                          the WorldMode facade, which calls `update(camera)` each frame.
    world/                The World Viewer's RENDERER side: stream a Minecraft world's chunks around the
                          camera with LOD. See "World viewer" below.
                          world-view.ts        The streamed scene: a map of loaded chunk meshes, a
                                               camera-distance load queue over IPC, frustum culling, LRU
                                               eviction under a hard cap, cross-chunk seam re-meshing +
                                               world-generation-edge border walls. update(camera) each frame.
                          worker-pool.ts       A small pool of chunk-mesh workers (load-balanced, cancellable
                                               jobs) + worker-protocol.ts (the request/response shape) +
                                               chunk-mesh.worker.ts (calls the shared geometry core / surface
                                               mesher off-thread, transfers typed-array buffers back).
                          surface.ts           Mid/far LOD: a cheap SURFACE mesh from the heightmap (top
                                               quads + cliff skirts) + chunkSurfaceColor for the minimap.
                          lod.ts               LOD bands + `lodForDistance` (hysteresis so a chunk on a
                                               boundary doesn't thrash levels).
                          chunk-borders.ts     Per-chunk EDGE occluder planes so a solid-against-solid chunk
                                               seam culls like an interior one (fed to a neighbour's near build).
                          components/          WorldHud (thin orchestrator: top-bar controls + coord/stream
                                               readout, composes WorldGotoForm + WorldStructureFinder; the
                                               EDIT pencil toggle — gated on Settings ▸ World's master
                                               switch, deep-links there when off; dim switch locked while
                                               editing) + WorldMinimap (2D top-down canvas map).
                          edit-overlay.ts      IN-WORLD EDITING (v2.2 §2), the pure compositor: pending
                                               edits overlay a CLONE of a chunk's cached payload at mesh
                                               time (original untouched — discard is just a re-mesh);
                                               palette/texture-key growth for painted blocks, uniform
                                               sections expanded, absent sections created. Unit-tested.
                                               The rest of the loop: state/world-edit.ts (the store —
                                               pending map keyed "x,y,z", tools paint brush/recolor +
                                               erase + box select w/ fill/delete (WORLD_SELECTION_CAP),
                                               undo/redo snapshots, save→api.applyWorldEdits),
                                               components/world-edit/ (WorldEditLayer = imperative bridge:
                                               registers the overlay compositor on WorldView, re-meshes
                                               exactly lastTouched chunks, plane-locked strokes via the
                                               world picking; WorldEditPanel = tool surface; WorldSaveModal
                                               = preview-then-write + result incl. refused chunks). Viewer
                                               world-edit surface: setWorldEditOverlay/remeshWorldChunks/
                                               invalidateWorldChunks/ensureWorldTextures/pickWorldBlock/
                                               pickWorldPlacement (border walls + entities are noPick).
  shared/
    ipc.ts                Single source of truth for IPC channel/event names
    types/                Type-only contracts shared by both bundles, grouped by domain
                          (structure, workspace, jigsaw, generation, export, edit, world, app, api =
                          BlockwrightApi) + an index.ts barrel — so `@/shared/types` stays the one import path.
                          world.ts = WorldMeta/WorldDimension/DimensionId/RegionRef/StructureLocation +
                          the ChunkRenderPayload/ChunkSectionPayload streamed to the mesh worker.
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
                          room-plan brief picks a preset by area, the gallery lists them; thresholds once) +
                          worldgen.ts (the export dialog's presets + PURE helpers: terrain/biome/rarity
                          presets, sanitizeResourceName, structureFolder = the 1.21 `structure`/`structures`
                          decision, plannedFiles, validateOptions — so the dialog preview and main's writer
                          can't drift).
    mc-version.ts         Parse/normalize MC versions + the supported-for-jigsaw predicate
    i18n/                 Tiny framework-free i18n shared by both processes: en.ts (canonical key
                          space) + pt-BR.ts (typed complete) + index.ts (resolveLocale/translate/
                          makeT/LanguageInfo). Flat dot-keyed `Record<MessageKey,string>`, `{token}`
                          interpolation, fallback locale→en→key. See "Internationalization (i18n)".
content/                  A user-supplied Minecraft content pack (assets/minecraft/...). NOT shipped
                          (Mojang's assets can't be redistributed); configured at runtime via
                          content-dir.ts. A local content/ here is auto-picked-up in dev.
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

The vanilla content pack is **not bundled** (Mojang's assets can't be redistributed) — the user
points Blockwright at their own extraction. `content-dir.ts` resolves it via `BW_CONTENT` env
override → the user's saved folder (persisted `content-dir.json` in userData; set in Settings ▸
Viewer or from the welcome screen, `content:get-dir`/`content:choose-dir` IPC) → (dev only) the
repo's `content/` if present → none (asset lookups then miss into the flat-color fallback).
`content-pack.ts` builds the namespace roots on top of that. Asset resolution is **namespace-aware**: refs are
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
the JSON/model caches. The statusbar's workspace segment shows the active workspace name. The mod's structures
(`data/<namespace>/structure/*.nbt`) then render with their custom textures, and are listed on the
welcome screen.

Opened workspaces are remembered in `recent-workspaces.ts` and surfaced both on the welcome screen
(next to recent files) and under File ▸ Open Recent Workspace. Opening a **loose** `.nbt` that sits
inside a mod (`<root>/data/<namespace>/structure/...nbt` with a matching `assets/<namespace>`) with
no workspace active triggers `detectWorkspaceForFile`, and the renderer shows a bottom-left prompt
offering to load that workspace; accepting activates it and re-renders the file so mod textures
resolve. Opening a **world** with no workspace active gets the same prompt via
`detectWorkspaceForWorld` (walks the world dir's ancestors — a dev-run save sits at
`<project>/run/saves/<world>` — trying `detectWorkspace`); accepting soft-refreshes the streamed
chunks (`onWorkspaceChanged` → `refreshWorld`), no reload path needed. The suggestion carries a
`kind: 'file' | 'world'` so the prompt's label matches.

A workspace can be **pinned** (`main/pinned-workspace.ts`, one record persisted in userData): the
pinned workspace auto-activates at every launch (BW_WORKSPACE still wins in dev; a stale pin is
dropped silently) until the user unpins it, pins another, or **closes the workspace** (an explicit
close = "I don't want this back", so `closeWorkspace()` clears the pin — both the menu and the IPC
close path go through it). The CONTROL is the statusbar pin beside the workspace segment
(hover-revealed; accent + filled while pinned) and the File ▸ Pin Workspace checkbox; the Project
panel shows passive pin glyphs on the active card + the pinned recent row. The renderer mirrors the
pinned ROOT (`store.pinnedWorkspaceRoot`, `pinnedWorkspaceChanged` event) — the pin state is always
`pinnedRoot === workspace.root`, and `applyWorkspace`/`setWorkspaceVersion` keep the pinned record's
name/version fresh when the pinned workspace itself changes.

Each workspace also carries a **target Minecraft version** (`mc-version-detect.ts` reads it from
`fabric.mod.json` / `mods.toml` / `gradle.properties` / `pack.mcmeta`; if none is found the renderer
asks via `version-select.ts` and `setWorkspaceVersion` persists it). Loose vanilla files assume the
bundled pack's version.

**Generating with the mod's own blocks** (`structure/assets/block-dictionary.ts` + `-derive.ts`): the
model has never seen a mod's blocks, so the user annotates the ones worth building with in the **Block
Catalog** (description + optional semantic `role`), persisted in a VISIBLE `blockwright/dictionary.json`
at the workspace root (travels with the mod). A workspace-level **scope** (off/mix/prefer, set in the
Catalog OR the Build Planner's "Mod blocks" control) drives generation TWO ways: (1) `modBlockGuide()` is
appended to the system prompt with the block list + a recommended role→block PRIMARY PALETTE (prefer only;
the "shell is already in these" note gated on a shell actually being seeded this run); (2) `modRoleOverrides()`
builds a role→mod-block map (`buildRolePalette`: a user-annotated role wins, then for `prefer` a heuristic
`guessRole` fills the rest) injected into the seeded shell's `template` op as `params.modBlocks` — which
`compose.ts makePalette` consults FIRST (above per-op/decoration/defaults, as its OWN object so it can't
collide with the `roof` MODULE enum), so the LOCKED code-built shell compiles in the mod's materials with
their custom blockstate props. Scoped to the host: a self-contained basement/surroundings module is NOT
re-skinned (its `modBlocks` is stripped in `makeModuleComposer`). Roles the mod lacks (windows/glass) fall
back to vanilla. `guessRole` excludes `*_wall` (a thin POST, never the solid wall material). Empty/no-op
for a vanilla run. The built editor rows are memoized per workspace (`entriesCache`, cleared on note/scope
edit + workspace switch).

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
  structure" map (`FinalizePass[]`; currently only `'chimney'` — e.g. `cottage = ['chimney']`). The
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
  laid geometry — every type has `floors()`); per-type DATA lives ON the module, never as id
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
  a GROUP id is the whole family in one tag, while a deliberate narrowing lists ids (the basements +
  rooms are `['house', 'tower', 'church']`; the attics are cottage-only; the roofs are house-only — the tower owns
  its crown; the yards split modern / the rest / and now all four-plus-tower). It's a GROWING link: the
  `tower` group is the live example — adding the keep meant tagging the basements/surroundings/rooms with
  `'tower'` (e.g. `crypt.appliesTo = ['house', 'tower']`), and `moduleAppliesTo` then shows each in the
  tower's Details + loads its guide. (Decorations + structure types don't use `appliesTo` — a decoration
  crosses with every structure, e.g. the universal `castle` look.)
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
  `roof`/`basement` in its param spec (`roof`: auto/gable/hip; `basement`: none + the basement-MODULE
  ids cellar/crypt/cult-temple — the SAME namespace the Details select + the other archetypes' central
  path use, so a "Cellar" pick rides in as `basement:'cellar'` and `build()` delegates the vault to that
  module; the old none/full/half enum REJECTED the module id in `resolveParams` → silently no basement),
  marked `module:'roof'|'basement'` in `ParamDef` so `paramFields`
  hides them from the house's own Details controls (no duplicate). **Add a roof/basement:** new file +
  register in its `index.ts`; give it `appliesTo` + optional `build()`/`integrations` + a
  `knowledge/nbt/modules/{roof,basement}/<id>.md`.
- **`room` modules are GUIDANCE-ONLY interiors** (`rooms/`: the 'general' family living/kitchen/
  library/bedroom/dormitory/storage + the 'horror' family ritual/dungeon/morgue/seance): each is a `RoomModule` (`ModuleMeta` + required `knowledge` + `presets` — no `build`/`preview`),
  authored via the **`defineRoom` factory** (`rooms/define.ts`) so a room file is PURE DATA (id/label/
  description/presets) and the factory fills the boilerplate ONCE: `category:'room'`, the knowledge path
  (`nbt/modules/room/<id>.md`, derived from id so it can't drift), each preset's id (`<id>-<scale>`,
  derived from its tier), and the default host link (`['house', 'tower']`, override to reuse on more).
  The user assigns up to two rooms PER FLOOR in the composer Details (shown for a storeyed structure, i.e.
  a `floors` param; one per floor on the tighter tower). The picked room ids ride along in `BuildSelection.rooms` (deduped) so each
  loads ONLY its own knowledge guide, and the per-floor layout is folded into the prompt as a `[Room plan]`
  line per floor (`buildRoomPlan` in `renderer/generation/brief.ts`). The AI furnishes each storey from those
  guides (partitioning a floor with two rooms into real, separated spaces). No geometry, so no gallery preview
  (the gallery lists them with their description + `appliesTo` + their FURNISHING PRESETS). Each room guide is
  HOST-AGNOSTIC and carries ONLY this room's furniture vocabulary — the scale/preset/decoration mechanics live
  in the always-on core guide `14-furnishing-by-space.md`, so a room guide never repeats it (no wasted tokens).
  **Add a room:** new `defineRoom({...})` file in `rooms/` + register in its `index.ts` + a
  `knowledge/nbt/modules/room/<id>.md` guide + `presets` (one per scale tier). `appliesTo` defaults to
  ['house', 'tower'].
- **`surroundings` modules wrap the shell in a code-built YARD** (`surroundings/`: modern,
  garden, graveyard): a required single-select slot defaulting to **None**. The user's W×D stays the
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
  `modern` (hosts: villa/tower) = pool terrace + entry walk + chamfered hedge + planters; `graveyard`
  (hosts: manor/tower/church) = a fenced cemetery yard; `garden` (hosts:
  cottage/farmhouse/raised-cottage/manor/tower/church) = the cottage homestead yard — cobble + oak-fence perimeter
  with SEEDED chamfered corners (the outline varies every build), stone lamp posts, a
  double-door gate aligned with the door, dirt walk + house loop path, facade flower beds, and
  seeded fountain/well/crop-plot/parterre features (uses the `path`/`soil`/`crop`/`flower` roles).
- **Seeded archetypes — code-built shells the AI only FINISHES** (`structure-types/`: ALL of them,
  cottage included): the fix for "the style keeps coming out as a wooden pitched box." A
  fresh AI build invents 100% of the geometry, and the model's strong rectangular-house prior overrides
  any advisory guide text — so styles the model can't reliably invent are NOT guidance; they're STRUCTURE
  TYPES that OWN their massing in code. Each archetype's `build()` emits its silhouette: **cottage**
  (was 'classic') = the baseline pitched storeyed home; **villa** (was
  'modern') = stacked offset white-concrete volumes, glass curtain walls with dark mullions, set-back upper
  floor + railed roof terrace, FLAT roofs by default but it HONORS the Roof slot (a `roof` param flat/gable/hip,
  marked `module:'roof'` like the house's; gable/hip cap the upper volume with a low white-quartz pitch and
  `modernRoofReserve` keeps the height for it; gable/hip `appliesTo` now include 'villa', and the modern
  decoration's `roof` role is a stairs material — the flat default uses `ceiling`/`trim`, so it's unchanged);
  **farmhouse** = L plan + cross-gable + veranda/gallery; **raised-cottage** (was 'sakura') = a pink
  cherry cottage RAISED on a VISIBLE stone-brick basement, the entry up on the raised floor reached by an
  exterior stone stair under the overhanging upper storey, a pink cherry-stair roof crowned with blossom
  cascades + an upper balcony; **manor** (was 'gothic') = a black-with-white-detailing manor (pale belt
  courses) with a central frontispiece tower projecting at the front and rising past the ridge (carrying the
  grand entrance), a balustraded front veranda, a mini corner tower past the roofline, a glass chapel wing down
  one side + ivy garlands over the eaves, steep slate roof. **keep** (was 'tower-classic', group 'tower') = a
  battlemented stone KEEP: a tall square shaft of stacked storeys, arrow-slit windows, a seated arched door on a
  stone plinth, a stair core, and a crenellated parapet over a walkable roof deck — it OWNS its crown in code
  (no roof/attic slot; Roof/Attic auto-hide for it), and links Basement/Surroundings/Room (every registered
  one) via the 'tower' group. **spire** (was 'haunted-tower', group 'tower') = a derelict gothic SPIRE: a
  battered flared plinth, a vertically RIBBED shaft (organ-pipe buttress pilasters) that STEPS inward in tiers
  as it rises, projecting iron-cage lantern arms on chains, a carved SKULL FACE on a wide front, a pointed
  gothic doorway under a glowing inverted cross, soul-lit lancet windows, full-height corner buttress piers
  tipped with lit spires, and a spiky crenellated crown — the carved exterior detail SCALES WITH WIDTH (a fat
  tower is densely articulated, the skull only carving when the front is wide/tall enough), so it never reads
  as a plain dark cube; it owns its crown in code like the keep and links the same Basement/Surroundings/Room
  modules via the 'tower' group; pairs with 'cursed'. **church** (group 'church') = a long buttressed NAVE
  under a steep gabled roof with tall arched windows, fronted by a square BELL TOWER that rises clear of the
  ridge to a stepped pyramidal spire topped by a CROSS (a `plan()`-budgeted top-down so the steeple always has
  room) — it too OWNS its roof + steeple in code (no Roof/Attic slot), pairs with the 'chapel' decoration
  (white plaster over stone; 'castle' gives grey stone), and links crypt/cellar/cult-temple basements +
  garden/graveyard surroundings + every room. Each declares its identity decoration as `pairedDecoration` on
  the MODULE (the composer auto-pairs it from the catalog — no hardcoded map); the cottage's is cozy, the
  keep's is 'castle' (a universal dressed-stone look), the spire's is 'cursed', the church's is 'chapel'.
  - **`seedShell: true`** (`StructureType`) makes a FRESH build SEED the model with this type's compiled
    shell instead of leaving it free-form: `ai/shell-seed.ts` compiles the shell (a `template` op at the
    requested `BuildSelection.size` + decoration) → temp `.nbt` → `readAuthoring` → `shellPreamble`
    (`ai/seed.ts`: "KEEP this exterior, furnish the interior, don't re-roof/re-clad it"), injected in
    `generate.ts` only on turn one of a fresh session. So the user gets a guaranteed silhouette and the
    model only finishes it. EVERY structure type seeds — the cottage and the keep included:
    run-to-run variety comes from the shell's own seed (window rhythm/corners/roof form/chimney side), not
    from free-form. Free-form remains the path for a build with NO structure selected.
  - **Every seeded shell is LOCKED** (no separate flag — `seedShell` implies the lock): a seed is only
    CONTEXT the model can ignore, and it does — it deletes the ground-floor slab + strips the roof (the
    "sem chão / sem telhado" defect) or emits a furniture-only delta that "keeps" the exterior by not
    re-emitting it, so the whole shell vanished (the raised-cottage "skeleton" defect — v1 was 1.3k blocks of
    carpets/barrels in a 45×69×24 box). `buildShellSeed` returns the compiled shell's solid cells as
    `lockCells`; `generate.ts` threads them into EVERY emit's compile (`CompileOptions.lockCells`), and the
    `preserveShell` pass restores any the model deleted. The exterior becomes code-OWNED (floor/roof/walls/
    tower can't be gutted) while the model still furnishes the interior + may redecorate (solid→solid) and
    glaze walls (a hole→pane is solid, so it's kept). (Door note: manor's central tower carries the
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
  blocks + mood, so no N×M data (and the same room reuses across structures — the house family and the
  tower keep today, more later). `buildRoomPlan` computes each room's area (the build's interior footprint split by the
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
  edited via `aiSetGeneration`): `maxRounds` (the emit→render→review cap — the #1 cost lever), `thinkingEffort`
  (a Claude reasoning-EFFORT level `off`/`low`/`medium`/`high`/`xhigh`/`max` — the current models use adaptive
  thinking + an `effort` knob, so the old fixed `budget_tokens` is gone; `off` disables thinking), `critic`
  (run the independent audit critic — Claude only). Three one-click PRESETS (`GENERATION_PRESETS`:
  Saver/Balanced/Thorough) set all three; the DEFAULT is **Saver** (3 rounds, no thinking, no critic) —
  deliberately cheap. `generate.ts` reads these per-run (env `BW_AI_MAX_ROUNDS`/`BW_AI_THINKING_EFFORT` still
  override); `maxRoundsFor` honors an explicit budget down to 1 (so Saver can stop before the full
  design-pass sequence — `rounds.ts`). The Claude SDK driver maps a non-`off` effort to `{thinking:
  {type:'adaptive'}, effort}` and `off` to `{thinking:{type:'disabled'}}` (legacy stored `thinkingBudget`
  numbers migrate: 0 → `off`, any positive → `medium`).

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
  at a cheaper model. **Extended thinking is tunable** (`thinkingEffort` knob / `BW_AI_THINKING_EFFORT`,
  `off` disables; default OFF under the Saver preset) — when on it plans geometry, and the system prompt
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
  registry-backed selects — **Structure** (cottage, villa, farmhouse, raised-cottage, manor, keep,
  spire, church — grouped by family: House / Tower / Church), **Decoration**
  (cozy/haunted/modern/farmhouse/sakura/gothic/castle/chapel/cursed), **Roof** (gable/hip/flat), **Basement** (cellar/crypt/
  cult-temple), **Attic** (storage/bedroom) and **Surroundings** (none/modern/garden/graveyard — required
  pick, defaults to None, filtered by the chosen structure's hosts — e.g. for keep/spire/church Roof/Attic hide
  (they own their crown) while every Basement/Surroundings/Room shows; a non-None pick reveals a
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
  `meta` footer keeps only the run cost (time + tokens) — version/size/blocks live on the card now. The
  card also surfaces the compile pipeline's AUTO-FIXES (a "N auto-fixes" note, full list on hover): the
  passes' `report.fixes` ride on `GenerateResult.fixes` → `BuildBrief.fixes` → `BuildCard`, so the
  silent repairs (stairwells/doors/shell restore) are visible (modders distrust silent behaviour).
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

### Export to mod workspace

"Export to Mod Workspace…" (the chat build card's button, or **File ▸ Export to Mod Workspace…** for
any open `.nbt` via `notifyExportToWorkspace` → `IPC_EVENTS.exportToWorkspace` → `exportToWorkspaceActive`)
writes a structure into the active workspace's data pack, so a generated build becomes a usable mod
artifact instead of an orphan in the library. The dialog (`components/export/`, opened via
`store.exportTarget`) writes the `.nbt` into the **version-correct** structure folder — `structure/`
for 1.21+, legacy `structures/` before (the #1 silent breakage when a pack moves versions) — and
OPTIONALLY the four worldgen JSON files that make Minecraft spawn it: a jigsaw **structure** def, a
**template_pool**, a **structure_set**, and a `has_structure` **biome tag**. The "Generate worldgen
files" switch is **OFF by default** (`DEFAULT_WORLDGEN.generate`), so a plain export just drops the
`.nbt` and leaves any hand-authored worldgen untouched.

- **Single source of truth, no drift:** `shared/domain/worldgen.ts` holds the presets + the PURE
  helpers (`plannedFiles`/`validateOptions`/`structureFolder`). Main's `planExport` (live preview:
  files with overwrite flags + problems) and `runExport` (the write) both build from those, adding
  only the disk-aware bits (exists / source-missing / legacy-folder). The dialog is a thin view over
  the plan; `worldgen-json.ts` are the pure JSON builders.
- **1.21 gotcha (test-enforced):** a `minecraft:jigsaw` structure def REQUIRES `spawn_overrides` (even
  `{}`) — it's `.fieldOf`, not optional, in the codec — or the datapack fails to load. `start_height:
  {absolute:0}` + `project_start_to_heightmap: WORLD_SURFACE_WG` is the vanilla village surface pattern.
- **Reads the mod's own biomes:** `listWorkspaceBiomes` (workspace.ts) walks `worldgen/biome/**` →
  `ns:path` ids; the dialog's Biomes control has a Mod/Vanilla source toggle, defaulting to a
  multi-select of the mod's biomes (a mod build usually belongs in the mod's biomes).
- **Validation catches the silent killers** (the pains that fail with NO in-game error): empty biome
  list, `separation ≥ spacing`, overwrites (shown as per-file REPLACE badges), the legacy folder.
- **Add a worldgen file / preset:** extend `plannedFiles` + a builder in `worldgen-json.ts` (+ test),
  or add a preset to `worldgen.ts`. **Add an export option:** it rides through `WorldgenOptions`.

### Oversized structures → jigsaw split

A Minecraft Structure Block only loads up to the size limit per axis (48 since 1.16, 32 before); a
bigger `.nbt` simply won't load. So when a structure exceeds the limit, EVERY export path cuts it into
a **jigsaw assembly** — a grid of pieces (each ≤ limit) plus the worldgen JSON that reassembles them
**voxel-perfectly** in-world. The size-limit preference lives in **Settings ▸ Viewer ▸ Structures**
(`settings.nbtSizeLimit`: `auto`/`48`/`32`, default `auto` → derived from the workspace's MC version);
the renderer resolves it via `effectiveNbtLimit` and threads the number into every export request.

- **Why it's lossless:** vanilla replaces each jigsaw block with its OWN `final_state` after generation,
  so each connector restores the original block at its cell. The only cost is the (≤2) seam cells per
  tree edge, placed off block entities so no NBT is lost (`split_block_entity` warns when unavoidable).
- **Pure planning vs. IO:** `shared/domain/split.ts` is the PURE layer — `splitPlan(size, limit)` decides
  the balanced grid + a center-rooted BFS **spanning tree** (shallow, to respect the distance cap) +
  the connector orientation/seam-cell math + canonical names. `main/structure/io/split-structure.ts`
  (`splitToJigsaw`, the `JigsawSplitter` class) does the block-level work; `shared/domain/worldgen.ts`
  (`splitFileSpecs`/`plannedFiles(…, split)`/`validateSplit`) owns the file list + limit checks. The
  renderer preview (`splitFileSpecs`) and main's writer derive from the SAME functions, so they can't drift.
- **Two in-game gotchas (test-enforced):** (1) `max_distance_from_center` ≤ **116**, not 128 — vanilla
  adds +12 for non-`none` terrain adaptation and rejects the def if the sum > 128. (2) `/place jigsaw
  <pool> <target> <depth>`'s `target` must be the NAME of a jigsaw on the ROOT piece (it anchors the
  command placement) — we pass a real `out_<edgeId>` connector, NOT `minecraft:empty`. Natural worldgen
  needs no such match. Limits: ≤ `MAX_SPLIT_PIECES` (200), depth ≤ `MAX_JIGSAW_DEPTH` (20); past them
  `validateSplit` BLOCKS the export (the local paths abort with a dialog, the workspace path with an error).
- **The three export paths converge here:** WORKSPACE (`export/index.ts` `runExport`, into the mod's data
  pack — the dialog forces "generate worldgen" on for a split), **Export As** (`export/local-export.ts`
  `exportStructure`, a sibling `<name>_jigsaw/` data tree), and **Export to World** (`exportToWorld`, a
  drop-in datapack at `<save>/datapacks/<name>/` + a native dialog that teaches the `/place` command with
  a Copy button). `.schem`/`.litematic` are NEVER split (their mods load arbitrary sizes). All three write
  via `writeSplitFiles` and build the assembly in memory FIRST, so a failure leaves no half-written tree.
- **Verification = a round-trip test** (`split-structure.test.ts`): decode the emitted pieces, rebuild
  each at its slot origin (where the assembly places it, proven per edge), and assert every non-seam cell
  + each seam's `final_state` matches the source — local proof of reassembly without launching Minecraft.
- **Add an export path / worldgen field:** reuse `splitToJigsaw` + `writeSplitFiles`; new size checks go in
  `validateSplit`, new piece/pool files in `splitFileSpecs` (+ a `JigsawSplitter.build` case).

### Block editor

"Edit" (the FAB on the stage when a structure is open) opens an in-viewer block editor — the last-mile
cleanup kit for AI builds (recess walls for depth, raise missing walls, fix circulation) and direct
hand-editing, attacking the documented pains of WorldEdit/Litematica/Axiom (lost selections, orientation
corrupted on transform, capped/corrupting undo).

- **Pure ops** (`renderer/editor/ops.ts`, unit-tested) rewrite `{size, palette, blocks}`:
  select (single / box / toggle), move, mirror/rotate (`planTransform`), extrude (spacing 1 = raise
  walls / stack; spacing > 1 = a repeating array), build stairs (facing-correct), replace, delete, plus
  the PAINT primitives — `placeCells` (the shared intern-and-overwrite for N cells, the base
  `placeBlock`/the symmetry-mirrored brush both route through), `recolorCell` (repaint an existing block
  in place), `floodFill` (the bucket — 6-connected same-entry region), `setVoidCell` (paint air /
  structure_void / clear, GUARDED so it never overwrites a solid), `airEntry` (a local air-flagged
  PaletteEntry, no IPC since air never renders), and `voidMarkers` (the solid-adjacent air/void cells for
  the overlay). Move/extrude/paint preserve orientation FOR FREE
  (they only copy a block's `state`); **mirror/rotate** rewrite the directional blockstate (facing/axis/
  shape/hinge/rotation) via the shared `structure/orientation.ts` `transformProps`, pivoting about the
  selection's OWN centre — the transform WorldEdit never fully fixed. The **store** (`state/editor.ts`)
  holds mode/tool/selection/anchor/params + an undo/redo SNAPSHOT stack, patches the active doc's
  `StructureData`, and the viewer re-shows on change (EditorLayer). A paint/void DRAG coalesces into ONE
  undo step via a STROKE (`strokeBegin`/`strokePaint`/`strokeEnd`): the brush block is resolved once at
  begin so each dragged cell is a synchronous edit, and only the first cell snapshots (`commit` =
  `applyResult(…, snap)` — the split that makes stroke-coalescing one code path). Move/extrude use
  precise ±1 axis buttons + arrow keys (no fiddly gizmo, by design); mirror/rotate are buttons too.
- **Paint tool** (`paint`, replaced the old single-click Place — a drag subsumes it) has three modes (a
  Segmented): **brush** (click/drag over surfaces to add), **recolor** (drag across existing blocks to
  repaint in place), **fill** (one-click flood-fill). A **hover preview** ghost (`HoverOverlay`, tinted
  per intent) shows the target cell BEFORE you commit — the #1 voxel-editor complaint. Brush + Delete
  honour live symmetry; the eyedropper samples into `paintBlock`.
- **Air / structure void** (`void` tool + the header "Show voids" toggle): the editor can SHOW the
  otherwise-invisible empty cells. Air + structure_void survive load (`load-structure` keeps every block)
  and save faithfully, but render as holes. Minecraft semantics matter here: on paste `minecraft:air`
  CLEARS the cell, while `minecraft:structure_void` (and a cell simply OMITTED from `blocks`) LEAVE the
  world untouched — void ≡ omitted, which is why the Void tool is just **air | void** (no "clear": an
  omitted cell already preserves terrain exactly like structure_void). Colors MATCH Minecraft's "show
  invisible blocks": **air = BLUE** (`AIR_MARK`), **void = RED** (`VOID_MARK`). `voidMarkers` (ops.ts)
  drives the overlay with three rules: (1) explicit `structure_void` → always shown (red, rare/intentional);
  (2) **OMITTED cells** (a cell not in `blocks`) in a DENSE capture (`blocks/box > 0.5` — the build lists
  its air so omission is an intentional carve-out, NOT the empty space around a sparse build) → shown as
  void (red), boundary-only, ALWAYS — THIS is the common "my `.nbt` has a structure_void region but no void
  block": a structure block drops the region from the list, so it survives only as omission; (3) explicit
  `minecraft:air` → bulk (a captured `.nbt` stores it for the whole volume — the fog problem), shown only
  when sparse (≤ `AIR_OVERLAY_CAP` = 256) or `revealAir`, boundary-only (blue). `EditorLayer` passes
  `revealAir = showVoids` — the header eye explicitly promises "air / void", so turning it ON reveals bulk
  air too (under ANY tool), not just void; turning it off drops the fog. The `void` tool FORCES the overlay
  on while active (the eye is disabled — it always shows there) and RESTORES the prior eye state on exit
  (`setTool` saves it into a `voidPrevShowVoids` closure: hidden → forced on → hidden again; shown → stays).
  `VoidOverlay` draws small wireframe markers with depthTest ON, so they're OCCLUDED by the build like real
  blocks. `setVoidCell` is GUARDED to touch only empty cells (a stroke runs harmlessly over
  solids), so void editing can't gut real geometry. A **cursor readout** (`describeCell` → the store's
  `hoverInfo`, shown in the panel for Paint/Void) names whatever's under the pointer — `air` / `structure
  void` / `empty` / a block id — via `viewer.identifyCell` (raycasts the solid mesh AND the void markers,
  nearest wins), so cells are always tellable apart even when the overlay is sparse. (A `.nbt` that looks
  like it has structure_void but shows nothing usually stores `minecraft:air` or omits the cells — both
  invisible; the readout / absence-of-cyan is the tell.) The **Inspector (Info panel) + Statusbar list
  air-like entries too** now (`groupBlocks` + `paletteCount`/`typeCount` no longer filter `entry.air`),
  so a `.nbt`'s `structure_void`/`air` show up in the palette with their counts — the file's palette is
  reported faithfully. (`blockCount`/"Blocks" stays SOLID-only — air isn't a placed block.)
- **Picking:** the geometry is merged per-material (no per-block meshes), so the Viewer raycasts and
  steps a hair ALONG THE RAY past the hit point — robust where the face normal isn't (a wrong-way normal
  would pick the wrong side). `pickBlock` steps INTO the surface (`+dir·ε`) for the solid cell;
  `pickPlacement` steps BACK (`−dir·ε`) for the empty cell in front (Paint's brush + the Void tool target
  it — NOT the void overlay, so a fog of air markers can't hijack a placement). A click that didn't move
  >4px is a pick; a NON-paint drag still orbits. For Paint/Void tools `viewer.setPaintNav(true)` hands the
  LEFT button to painting and orbit to the RIGHT button (the MagicaVoxel convention), so a stroke never
  fights the camera; a drag with pointer-capture paints continuously, and EditorLayer COALESCES the
  per-cell structure patch into at most one mesh rebuild per frame (a fast drag would otherwise rebuild
  the merged geometry dozens of times a second). `SelectionOverlay` draws the cobalt selection boxes;
  both new overlays extend the shared `SceneOverlay` like it.
- **Live symmetry** (`symmetry` off/x/z in the store, a Segmented shown under the rail ONLY for the Paint +
  Delete tools, since it only affects those — no phantom control elsewhere): Paint (brush) + Delete
  are mirrored across the structure's centre on that axis, with the placed block's directional blockstate
  flipped (`mirrorCell` + `transformProps`). While symmetry is on, the viewer draws a translucent cobalt
  **mirror plane** through the structure centre (`SymmetryOverlay`, mirrored from the store by `EditorLayer`)
  so you SEE where placements land. **Replace + Paint** each carry a 3D swatch (`BlockPreview`) of the
  target block + an **eyedropper** (`eyedropper` flag → next click `sample`s the block under the cursor
  into the active tool's block field).
- **Rendering a NEW block** (Replace / Stairs) needs resolved models → IPC `structure:resolve-block`
  (`resolveBlockEntry` in block-catalog.ts) returns {entry, textures}; the store interns it + merges
  textures, then re-shows.
- **Save = a new version, never fatal:** IPC `structure:save-version` (`ai/save-version.ts`) re-encodes
  the edited blocks straight via `encodeStructure` — BYPASSING the AI-repair passes so edits are faithful
  — re-attaching block-entity NBT via each block's **`nbtPos` origin cell** (`StructureBlock.nbtPos`,
  stamped at load for NBT-carrying blocks and preserved by every op that keeps/copies a block —
  move/extrude/replace/recolor/fill/transform — so a MOVED chest/jigsaw/data-mode structure block keeps
  its NBT; a block without `nbtPos` never attaches, so a fresh block painted over an old chest cell
  can't inherit stale NBT) + entities/DataVersion from the source `.nbt`, lands as
  `vN.nbt` in the session scratch + library, recorded via `commitManualVersion` (generation.ts) like an
  AI version. Plus full undo/redo. Edit mode auto-exits on tab change (App effect on `activeDoc.id`).
- **Structure data (data markers) is editable in place** (`DataMetaEditor`): when the selection holds
  data-mode structure blocks (`minecraft:structure_block` with `mode=data` — a MISSING `mode` counts
  as data, vanilla's default state, so a freshly painted structure block qualifies), the panel shows a
  "Structure data" field under the selection readout — the write-side of the Inspector's data-marker
  rows, in the same dialect (mono string + the `data` chip). Enter/blur applies (ONE undo step via
  `setDataMeta`), Escape reverts; a multi-selection sharing one string edits all at once, mixed strings
  start empty with a "typing replaces all" placeholder (an untouched blur never blanks them). The edit
  rides on the block as `StructureBlock.dataMeta` (preserved by every op, like `nbtPos`); save merges
  it into the source NBT (`{...src, metadata}`) or MINTS a minimal `{mode:'DATA', metadata}` block
  entity for a marker painted fresh — so new markers can be authored entirely in-app.
- **Add a tool:** a pure op in `ops.ts` (+ test) + a store action + a `ToolControls` branch + a
  `ToolRail` entry + its `editor.*` i18n labels.

### v2.1 studio tools (Diff / Re-theme / Render / Doctor / watch mode)

Four File-menu tools over any open build (imported `.schem`/`.litematic` included) plus an
always-on dev loop — the v2.1 whitespace features:

- **Structure Diff** (File ▸ Compare with File…, or the Versions panel's compare action): the pure
  core is `renderer/diff/diff.ts` (see the tree); `state/diff.ts compareActiveWith` publishes a
  `DiffView` into `store.diff`, `useViewerSync` mirrors the marks into the viewer's `DiffOverlay`
  (green added / red removed / yellow changed — added/changed are OVERSIZED shells around the block,
  removed is an inset ghost; marks persist across rebuilds like the floor bands) and `DiffPanel`
  shows the counts + per-block rollup. The diff is auto-invalidated when the tab changes or the
  block editor goes live (edits would silently drift the marks).
- **Re-theme** (File ▸ Re-theme Structure…, `RethemeModal`): whole-build palette swap with the
  blockstate CARRIED (the store's `retheme` resolves each target with the SOURCE entry's props, so
  a stair keeps facing/half/shape — the thing naive find&replace breaks; pure op `rethemeBlocks`
  keeps position/nbtPos/dataMeta). "Suggest from decoration" asks main (`structure:retheme-map`,
  `catalog/retheme-map.ts`) to role-classify the palette (dictionary note → guessRole) against a
  registered decoration. Applying is ONE undo step and lands in edit mode so Save-as-version is
  one click.
- **Beauty Render** (File ▸ Render Image…, `RenderModal` + `viewer/beauty-render.ts`): high-res PNG
  stills (preset angles current/hero/iso/front/top/cross-section; transparent or themed background —
  the GL canvas is already alpha, the fill happens on the 2D composite) and a one-orbit turntable
  WebM via `canvas.captureStream` + MediaRecorder. Both save/restore every renderer/camera state
  they touch (the capture.ts discipline); bytes go to main's save dialog over `render:save`.
- **Worldgen Doctor** (File ▸ Workspace Check-Up…, `DoctorModal` ← `workspace:doctor` ←
  `export/doctor.ts`): the whole-workspace audit — see the tree entry for the rule list. Findings
  are `{level, code, file, detail?}`; every code has a `doctor.issue.<code>` fix-it string (en+pt).
- **Watch mode** (`main/file-watch.ts`, always on): the on-screen file hot-reloads on external
  edits (registered by `useAppIpc` over `watch:file`; skipped while a run is in flight or the
  editor is dirty), and the workspace's structure folder keeps the Project panel list live.
- **Editor v2.1 UX**: 1–9 number keys switch tools (TOOL_ORDER; tooltips show the number), Esc
  walks back eyedropper → Select tool → clear selection, Alt+click samples from any block-field
  tool (paint/replace/stairs), a paint/void stroke is PLANE-LOCKED to the face it started on
  (`viewer.pickOnPlane`; bridges gaps, never jumps depth mid-drag), and an on-canvas hint chip
  names the active tool + its live modifiers. Air/void is fully multi-layer: `voidMarkers`
  reveals interior cells (dimmed `deep` markers, bounded by DEEP_OVERLAY_CAP; bulk-air interiors
  never revealed), Alt+scroll steps the Void tool's target deeper along the aim ray
  (`pickPlacementAt`, walked cell-by-cell so any camera angle steps exactly one cell), and
  "Fill selection box" (`fillVoidBox`) writes a whole multi-layer air/void region in one undo step
  (solids always preserved).

### Versions

Each open tab keeps a **version chain** — the compiled `vN.nbt` builds the AI loop + the block editor
produce — surfaced in the **Versions panel** (`windows/VersionsWindow.tsx`) with created/modified dates.
The chain ops live in `renderer/state/versions.ts` (NOT generation.ts — extracted so the panel, the
exporters and the editor share one source, via `persist.ts` + `doc-loader.ts` to avoid an import cycle).

- **ONE version per AI run.** A run refines a build in place: `generate.ts` allocates one `runVersion =
  session.version + 1` up front, and every design-pass emit OVERWRITES it — the renderer's `recordVersion`
  dedupes by number, so a run yields a SINGLE version, not one-per-pass. Each emit compiles to a TEMP
  `v{n}.work.nbt` and is promoted to `v{n}.nbt` only after it clears the collapse gate, so a rejected later
  emit can't clobber the last accepted build at the shared number. A new prompt = a new run = the next number.
- **The "Current" version** (`Document.currentVersion`, null = follow latest) is the base every export,
  manual save and AI edit builds on — resolved once via `currentBasePath(doc)`. "Set as Current" promotes a
  version (and previews it); any new commit resets it to follow the latest. Promoting an OLDER version and
  generating REBASES: `generate.ts` (`sessionVersionOf`) detects the older base, clears `sdkSessionId` (a
  fresh conversation), seeds from that file, and resets `session.lastSolids` so the gate doesn't falsely
  reject a smaller base.
- **Delete** (`deleteVersionEntry` → IPC `aiDeleteVersion` → `session.ts deleteVersion`) removes a version's
  scratch + library files, with a confirm. The Current AND the latest/HEAD are protected on BOTH sides (the
  panel hides the button; main refuses `version >= session.version`) — the head backs the next run's seed.
- **Reimport from World** commits the stitched `.nbt` as a new version of the active GENERATED project (the
  round-trip's home), not a throwaway tab. **Block editing is locked while a run is in flight** (`doc.busy`).

### Schematic interop

Blockwright opens + exports **WorldEdit `.schem`** (Sponge) AND **Litematica `.litematic`** schematics,
not just vanilla `.nbt` — widening the audience to every WorldEdit/Litematica builder. The whole app is format-agnostic
because everything funnels through the shared raw `{size, palette, blocks}` shape: `loadStructure`
detects the extension and a `.schem` is decoded by `io/schematic.ts` → `buildStructureData` (the
same resolution a `.nbt` gets), so a schematic renders, edits (the block editor), and exports
identically. The open + Export-As dialogs (`main/window.ts`) list both formats; `io/convert.ts`
writes by the destination extension (`.nbt`→`.nbt` is a lossless copy, else re-encode through raw).

- **`.schem` format (test-enforced round-trip):** gzipped NBT like `.nbt`, but blocks are a **varint
  (LEB128) palette-index stream** in `x + z*W + y*W*L` order, not an explicit list. v2 keeps blocks at
  the root; v3 nests them under `Schematic` › `Blocks` (and renames `BlockData`→`Data`) — `decodeSchem`
  handles both, `encodeSchem` writes v2 (widest reader support). The palette is block-state STRINGS
  (`minecraft:oak_stairs[facing=east]`) ↔ `{Name, Properties}` (`parseBlockState`/`blockStateString`).
  Gotchas: unsigned varint (`>>> 7`, mask `& 0x7f` on signed bytes), unsigned `Width/Height/Length`
  shorts, air is explicit in the stream (dropped on import to match `.nbt`'s sparse list).
- **`.litematic` format (test-enforced round-trip):** gzipped NBT with a MULTI-region `Regions` map; each
  region's blocks are a **bit-packed long array** in the pre-1.16 **SPANNING** scheme (entries cross long
  boundaries — do NOT apply vanilla-1.16 non-spanning padding). `bits = max(2, ceil(log2(palette)))`; cell
  order `y*sx*sz + z*sx + x`. 64-bit math uses **BigInt** (prismarine-nbt stores each long as a `[high,low]`
  signed-int32 pair → reassemble unsigned, split back signed). `decodeLitematic` reads every region (palette
  is `{Name,Properties}` compounds) and normalises to the declared region BOUNDS (air margins survive, so the
  size matches a `.nbt`); `encodeLitematic` writes one region. `Size` axes can be negative (drag direction).
- **Block entities ARE carried** through every conversion: `RawStructure.blockEntities` ({pos, id, nbt}) is
  read from each format (`.nbt` block `nbt`; `.schem` `BlockEntities` Id+Pos+fields; `.litematic` region
  `TileEntities` x/y/z+fields) and written back, re-attached to the block by position on a `.nbt` write — so
  chest contents / sign text / structure-block data survive `.nbt`↔`.schem`↔`.litematic`. The arbitrary NBT
  fields serialise via `inferCompound` (exported from `nbt-encode.ts`). (Rendering doesn't need them — block
  entities draw from the block NAME — so the import/render path ignores them; they ride the convert path.)
  **Entities** (armor stands, item frames, mobs) ride along the same way: `RawStructure.entities`
  ({pos, blockPos, nbt}) is read by `readAuthoring`/`readRaw` and written back on a `.nbt` write, so a
  format conversion — and the jigsaw split (which partitions them per piece) — no longer drops them.
  Unlike block entities, entities have no palette block, so they'd otherwise be invisible — the load
  path DOES render them: `loadStructure` projects each raw entity into a `StructureData.entities`
  (`StructureEntity`) via `assets/entity.ts` `resolveEntities`, and the viewer draws them
  (`viewer/entity-mesh.ts`) — the armor stand as its real vanilla box model (entity texture + `Pose`
  + Small/ShowArms/NoBasePlate flags), every other id as a deterministic fallback cube. They're also
  listed (grouped by id, with a focus jump) in the Inspector alongside the block palette.

### World viewer

**File ▸ Open World…** (Cmd+Shift+W / welcome / recents / `BW_OPEN_WORLD`) opens a whole Minecraft
save folder (`level.dat` + `region/*.mca`) as a **view-only fly-through** — parallel to the
single-structure `.nbt` path, but the world is far too big to hold in memory, so it's STREAMED
chunk-by-chunk with level-of-detail. The world is never modified.

- **Main reads the disk, renderer streams the scene.** `main/world/` owns the Anvil format (pure,
  testable `anvil/`: world-paths / level-dat / region-file / chunk-decode) and a lazy cached
  `WorldSource` (bounded LRU over region buffers + decoded columns). `chunk-resolve.ts` bridges a
  decoded `ColumnData` → `ChunkRenderPayload` through the **existing** asset pipeline
  (`resolveBlockEntry`), memoised by block-state string — a world has millions of blocks but only a
  few hundred distinct states, so each resolves once. The active world is a singleton
  (`active-world.ts`, mirrors content-pack's active-workspace) referenced by the IPC handlers via
  `world-service.ts`, so chunk requests don't re-pass the path. Typed-array chunk grids
  structured-clone across the bridge (no JSON of block data).
- **The renderer's `WorldView`** (`renderer/world/world-view.ts`) requests the chunks around the
  camera over a bounded in-flight queue, meshes them OFF the main thread in a **worker pool**
  (`worker-pool.ts` + `chunk-mesh.worker.ts` + `worker-protocol.ts`), swaps chunk groups in/out, frustum-culls,
  and LRU-evicts under a hard resident cap. `update(camera)` runs each frame from the Viewer.
- **Shared geometry core, one source of truth.** The worker calls the SAME
  `viewer/geometry-core.ts buildGeometryBuffers` as the single-structure path (with neighbour
  face-culling ON for the world — a solid stone section would else emit 4096 cubes of buried faces).
  A golden test pins the structure output so the two renderers can't drift.
- **Cross-chunk seams.** A chunk is meshed in isolation, so a face on its X/Z border has no neighbour
  to cull against and would wall off the view when you fly through terrain. `chunk-borders.ts`
  precomputes each chunk's four EDGE occluder planes (bit-packed) on the main thread; the view hands a
  neighbour's facing edge into a near build (`NeighborBorders`) so a solid-against-solid seam culls
  like an interior one. A late-arriving neighbour re-meshes the seam (a neighbour-mask bit flips).
- **LOD** (`lod.ts`): near = full block geometry; mid = a textured heightmap SURFACE (top quads +
  cliff skirts, `surface.ts`); far = the same surface in flat biome-tinted colour. Bands scale with
  the render-distance control, with hysteresis so a boundary chunk doesn't thrash levels. A
  world-generation EDGE (ungenerated or empty proto-chunk) is drawn as a translucent red border wall
  with its cross-section culled, not the raw sliced "paredão".
- **HUD** (`renderer/world/components/`): `WorldHud` is a thin orchestrator (top-bar controls + the
  coord/stream readout) composing `WorldGotoForm` (go-to X/Y/Z) + `WorldStructureFinder` (scan +
  jump to any generated structure, `world-source.ts findStructures`, cached per dimension) +
  `WorldMinimap` (a 2D top-down canvas that fills in with real terrain colours). Day/night is a
  lighting mood toggle (no sky sim); the dimension switcher lists only dimensions with region data
  on disk (vanilla + mod). `biome-tint.ts` gives each chunk its dominant grass/foliage tint.
- **Version support:** 1.13+ paletted chunks (1.18+ root `sections`, legacy `Level.Sections`,
  spanning vs non-spanning handled in `chunk-decode.ts` via `structure/io/long-bits.ts`); pre-1.13
  numeric-ID worlds fail soft (logged + skipped). Dev capture: `BW_WORLD_CAM`/`BW_WORLD_LOOK` aim the
  initial fly-through camera for a headless screenshot.
- **Add support for an older format / a HUD control:** extend `chunk-decode.ts` (+ its `__tests__`)
  for the format; a new HUD panel is its own component composed into `WorldHud`.

### Updates

Two complementary layers, both wired by `initAutoUpdates()` (`main/updater.ts`) at launch:

1. **Auto-install** via `update-electron-app` → update.electronjs.org (serves the latest published
   GitHub Release through Squirrel). Self-installs IN PLACE only where Squirrel can: **Windows**, and a
   **signed + notarized macOS** build. No-op in dev, on Linux (distro package manager), and on the
   current ad-hoc-signed mac (see [macOS signing](#) in `forge.config.ts`).
2. **Notify-only** GitHub-release check (`main/update-check.ts`) — for the platforms layer 1 can't
   auto-install (unsigned macOS + Linux), it DETECTS a newer release and tells the user; it never
   installs. Runs at launch (skipped on Windows, which Squirrel covers) + every 6h.

- **One detection path:** `detect()` does fetch → cache → push the banner; `fetchUpdateInfo` is the
  PURE detector (no side effects, throws on error). Three call sites share `detect`: `checkForUpdatesInBackground`
  (silent, swallows errors), `checkForUpdatesQuiet` (the About card — returns the result for INLINE
  status, no dialog), `checkForUpdatesManually` (Help ▸ Check for Updates… — adds the native
  "up to date"/error dialogs). Version compare is the pure, unit-tested `update-version.ts`.
- **Surfaces:** a dismissible bottom-centered **banner** (`UpdateBanner.tsx`, store `update`) and the
  Settings ▸ About **`UpdateCard`** (a self-managing, state-driven card: idle/checking/upToDate/
  available/error — only `available` spends the accent; version shown in `--mono`). Both open the
  release page via `shell:open-external` (https-only). A detection drives both (the card also sets the
  global `update` so the banner follows).
- **Push/pull race:** the launch push (`IPC_EVENTS.updateAvailable`) can fire before the renderer
  subscribes, so main caches the last hit (`getPendingUpdate`) and the renderer PULLS it on mount
  (`IPC_CHANNELS.updatePending`) in addition to listening for the push. The launch check is also
  deferred until the window's `did-finish-load` (`runAfterRendererReady`).
- **`BW_FORCE_UPDATE_CHECK` (dev hatch):** truthy runs the notify check unpackaged on any platform; set
  it to a version like `9.9.9` to FORGE a synthetic newer release so the banner + card can be tested
  without a real release. Verify the banner via `BW_CAPTURE`; verify the card states via a standalone
  HTML preview (the modal isn't reachable headlessly).

## Conventions / gotchas

- **Synthesized blocks (entities + fluids):** some blocks have a particle-only blockstate
  model because vanilla draws them with a dedicated renderer. `resolveBlock` intercepts them
  before the normal model path: `fluid.ts` (water/lava) and the `block-entity/` dispatcher
  (chest/bed/banner/skull/decorated-pot). Each builds `ResolvedModel`s directly. **Add a new kind as its own file**
  in `block-entity/` and wire it into `block-entity/index.ts` — don't lump them together.
  Don't confuse these with structure ENTITIES (armor stands, mobs): those aren't blocks — they carry
  no palette entry — so they're resolved in `assets/entity.ts` and drawn by the renderer's
  `viewer/entity-mesh.ts`, not through `resolveBlock`/`block-entity/`.
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
- **Empty model ≠ unresolved (the "corrupted second block" defect):** a model that LOADS but
  declares no `elements` is INTENTIONALLY empty — the standard Minecraft "all geometry in the base,
  empty placeholder on top" convention for tall blocks (umbrellas, statues): the lower model's
  elements overflow past y=16 into the cell above, and the upper half is a geometry-less model that
  must render NOTHING. So `buildResolvedModel` (`model-loader.ts`) returns null ONLY when the model
  file is missing (genuinely unresolved → the renderer stamps a `fallback-color` cube); a loaded but
  element-less model resolves to `{ elements: [] }`, NOT null. That keeps the entry's `models.length`
  ≥ 1, so `mesh-builder.ts` skips the fallback-cube branch and `addModel` draws nothing for the empty
  cell — instead of a default-colored box sitting on top of the (correctly tall) lower geometry.
  Tested in `assets/__tests__/model-loader.test.ts`.
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
- **Workbench chrome:** row 2 of the shell grid is `.workbench` — the fixed **ActivityBar** rail
  (width `RAIL_W`/`--rail-w`, keep in sync), the toggleable **ProjectPanel** (left, resizable via
  `leftWidth`), then `.stage-area` (`flex: 1` — the viewport + console column, the right inspector
  dock resizable via `rightWidth`, and the BuildPlanner overlay anchor). Chrome surfaces (rail,
  panels, top/status bars, console) use the opaque **`--chrome`** token, a step quieter than `--bg`
  so the 3D viewport reads as the lit stage. Both side panels resize via `ui/resize.ts startColDrag`
  + a `.col-resize` handle; widths are clamped by `LEFT_PANEL`/`RIGHT_PANEL` and persisted.
  `project` is a `WindowId` (View ▸ Project Panel, Cmd+B) but tracks visibility only in the flat
  `projectVisible` flag — `setVisible('project')` maps to it, `setPos`/`toggleMinimized` no-op.
- **Floating windows:** Inspector / Jigsaw / Versions share one chrome (`components/FloatingWindow.tsx`):
  titled, draggable (clamped to the stage), redock / minimize / **close** (close hides via
  `setVisible(false)` — reopen from the View menu). Layout lives in `state/windows.ts`
  (persisted). The native **View** menu
  shows/hides each window and offers Layout ▸ Reset Window Positions; `App.tsx` reports
  `{visible,available}` per window to main (`reportWindows`) so the menu's checkmarks/enabled state
  track the renderer (which owns the state). Don't inline window positions — go through the store.
- **Console dock:** a `WindowId` like the others, but it's the **full-width bottom dock** (not a
  sidebar tab or floating window), so — like `controls` (now the Keyboard Shortcuts overlay,
  `ShortcutsHelp`, Cmd+/) — it tracks visibility only (plus a persisted,
  resizable `consoleHeight`) and is NOT a `PanelId`. App.tsx wraps the stage row + `ConsoleDock` in a
  `.stage-area` column so the console spans the full width (under the sidebar) while the stage shrinks
  (the WebGL canvas resizes instead of being covered). Toggled from View ▸ Console (Cmd+Shift+K); the
  `onToggleWindow` handler treats `console`/`controls` as plain visibility toggles (no `openPanel`).
  It shows BOTH processes' `console.*` output (see `main/logger.ts` + `state/logs.ts`) so packaged
  builds — with no terminal — stay inspectable. The View menu also opens the Block Catalog
  (Cmd+Shift+B) + Module Gallery (Cmd+Shift+M) modals via their own divider group (they're modals,
  not window toggles, so they `notifyOpenCatalog/Modules` → `store.setCatalogOpen/ModulesOpen`).
- **Home / tabs:** `activeId === null` (documents store) is the **Home** state — the Welcome screen
  shows whenever there's no active doc, even with tabs still open. The **app mark at the top of the
  activity rail** (`ActivityBar`, `goHome()`) returns there; clicking a tab
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
  light) { :root:not([data-theme]) }`, and an explicit choice sets `[data-theme="<id>"]`
  (wins; strict CSP forbids a no-FOUC inline script, so don't add bare `prefers-color-scheme`
  rules — scope them to `:not([data-theme])`). (2) **`nativeTheme.themeSource`** (set from
  `state/theme.ts` via the `themeSet` IPC, mapped to light/dark via `nativeModeFor`) so the
  renderer's `prefers-color-scheme` (and the native traffic lights / dialogs) follow a forced
  theme — the native traffic lights and dialogs rely on that tracking (the `Logo` mark is
  theme-neutral now: one squircle artwork, no light/dark swap).
  `settings.theme` is `'system'` or a `ThemeId` from the **theme registry**
  (`renderer/state/themes.ts`: light/dark + the SKINS minecraft-light/-dark [launcher charcoal /
  minecraft.net paper white + grass-green #3c8527]); default system. Each registry entry mirrors a
  `[data-theme=…]` token block in `index.css` — **add a theme in BOTH places** (+ its
  `appearance.*` label in en/pt-BR). The picker is the **ThemePicker** card gallery
  (`components/settings/ThemePicker.tsx`): one miniature-workbench card per theme drawn from the
  registry's preview colors (System = a diagonal light/dark split), a radiogroup, replacing the
  old 3-option Segmented. `--mono` is for numeric/dimensional data (sizes, counts, coords).
- **App icon / logos:** ONE artwork everywhere — the repo-root `icon.png` (2048², an AI-generated
  squircle tile whose fake-checkerboard "transparency" + watermark were cut away with a fitted
  anti-aliased superellipse mask; the mask constants + every derived asset live in
  **`build/make-icons.py`** — regenerate with `python3 build/make-icons.py` (needs Pillow+numpy;
  `iconutil` step is darwin-only). The bottom edge of the mask includes the tile's dark bevel
  UNDERSIDE (a cool-tinted ~18px band below the bright rim) — clipping it makes the bottom rim read
  thinner than the top. There are NO light/dark logo variants anymore. Derived assets: the in-app
  logo is `public/logo.png` (the transparent squircle, referenced relatively — `logo.png`, not
  `/logo.png` — so it resolves under `file://` when packaged; the `Logo` component is a plain
  `<img>`, and the artwork carries its own rounded corners in alpha, so no CSS `border-radius`
  clipping on it). `build/icon-master.png` (the squircle centered on 1024² with a ~92px transparent
  margin) drives the Windows `build/icon.ico` (Windows draws the icon as-is). **macOS gets a
  FULL-BLEED master** — `build/icon-master-fullbleed.png` (1024² opaque) → `build/icon.icns` (the
  packaged bundle icon, via `forge.config`) + `build/icon.png` (1024², the dev dock icon
  `app.dock.setIcon` + the Linux deb/rpm icon). The full bleed is REQUIRED on macOS 26 (Tahoe): the
  OS composites every legacy icon (.icns AND the dev-dock PNG — packaged renders the same as dev)
  onto a standardized rounded tile and masks it to ITS squircle, so transparent padding shows as a
  WHITE BORDER. And because Tahoe's mask corners (~22.4% radius) are SQUARER than the artwork's
  (~29%), flat-filled corners show as navy gaps breaking the silver rim — so the full-bleed's
  corners are the rim's straight-edge cross-sections extended with a 45° MITER (a 9-slice), keeping
  the frame continuous under any OS mask radius up to the artwork's own. The only pixel-perfect
  Tahoe icon remains the Icon Composer route (`Assets.car`, next bullet).
- **macOS 26 Liquid Glass icon (packaged only):** the proper Tahoe icon is a compiled `Assets.car` +
  `CFBundleIconName`, NOT the `.icns`. Forge has no built-in support, so `forge.config.ts`
  `installLiquidGlassIcon` (a `packageAfterCopy` hook) drops `build/Assets.car` into the .app's
  `Contents/Resources/` and sets `CFBundleIconName: AppIcon` before signing — but ONLY if `build/Assets.car`
  exists, so it's a no-op until you author one. Authoring needs a Mac with **Xcode 26+** (for `actool`) +
  **Icon Composer**: design `build/AppIcon.icon` (import `icon-master-fullbleed.png` as the artwork), then
  `xcrun actool build/AppIcon.icon --compile build --app-icon AppIcon --platform macosx
  --minimum-deployment-target 26.0 --output-partial-info-plist /tmp/ai.plist` → `build/Assets.car`. The
  `.icns` stays as the pre-Tahoe fallback (both coexist). This can't be produced/verified without Xcode 26,
  so the hook ships dormant.
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
- `BW_OPEN_WORLD=/path/to/save` — open a Minecraft world folder (the World Viewer) on startup.
- `BW_WORLD_CAM=x,y,z` / `BW_WORLD_LOOK=x,y,z` — override the initial world fly-through camera
  position / look target, so a headless capture can start underground / at a cliff (caves, grass
  sides, bedrock, world edges).
