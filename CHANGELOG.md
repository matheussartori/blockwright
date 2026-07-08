# Changelog

All notable changes to Blockwright are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-07-08

Edit your world like you edit a build — place blocks, paste whole structures
previewed and orientation-correct, and cut regions back out as schematics, with
enforced backups, session-lock safety and atomic writes. Plus the exploration
pack (Y-slice, waypoints, block search, material lists) and a datapack upgrader
that tells you exactly what changed.

### Added

- World editing — the world viewer became a world *editor*. Enter Edit on an
  open world and the block-editor tools work on real terrain: paint
  (brush/recolor), erase, and box select with fill/delete, with undo/redo, a
  hover ghost and plane-locked strokes. Edits stay local until **Save to
  World**, whose dialog previews exactly what will be written — the blocks, the
  chunks, the backup about to be taken — before a byte moves.
- A safe write path no other world editor ships, on by design and not
  optional: the `session.lock` is held so Minecraft and Blockwright can't
  fight over the save, every touched region file is backed up before the first
  write (with a Restore/Delete manager in Settings ▸ World), chunk NBT is
  surgically patched (never re-serialized from the render model, so mod data
  and untouched tags survive byte-for-byte), regions are rewritten atomically,
  lighting/heightmaps are handed back to the game to recompute, POI records are
  invalidated, and a chunk that fails any gate is refused — never "best effort"
  written. Worlds open read-only until the master switch in Settings ▸ World is
  turned on.
- Place structure into world — drop any open build (`.nbt`, `.schem`,
  `.litematic`, an AI version) into the open world as a translucent ghost,
  nudge it with arrows/PgUp/PgDn, rotate with R (stairs, doors and rails land
  facing right — orientation-correct, the transform WorldEdit still corrupts),
  and commit through the same safe write path. `structure_void` and omitted
  cells leave terrain untouched; `minecraft:air` clears, exactly like an
  in-game paste.
- Extract from world — the inverse, closing the loop: box-select a region and
  **Open as tab** (edit, re-theme, diff, place it back) or **Save as…**
  (`.nbt`/`.schem`/`.litematic`, block entities and entities carried, oversized
  regions auto-split into a jigsaw assembly). Capturing from a world no longer
  needs in-game structure blocks at all.
- Y-slice / underground mode — cut everything above a chosen Y away (HUD panel
  with a slider, `[` / `]` to nudge, Shift for ×8) and browse caves, dungeons
  and basements like a doll's house. Structures get the counterpart: storey
  isolation — click a storey in the new bottom-left chip and the view clips to
  that floor band. Both levels are remembered per world/structure (Settings ▸
  Viewer).
- Waypoints — bookmark the camera anywhere in a world (name + position +
  dimension, saved per world), jump back from the HUD list; jumping to a
  waypoint in another dimension switches there first. Spawn and last-player
  jumps sit beside it.
- Cursor readout — the block under the crosshair, named: position, block id
  and biome, resolved live from the streamed chunks (the F3 essentials without
  the game). Verbosity is configurable (coords / +block / +biome).
- Find blocks — search a block id across the loaded area ("where are my
  diamond ore / spawners / chests"), results nearest-first as a jump list plus
  amber markers visible through terrain.
- Chunk grid + slime chunks — chunk-boundary lines around the camera (region
  corners highlighted) as a HUD toggle, and the minimap gained region-boundary
  lines plus a seed-derived slime-chunk overlay (exact Java `Random` math, so
  it matches the game).
- Server saves — Bukkit/Spigot/Paper worlds now open whole: the sibling
  `<world>_nether/` and `<world>_the_end/` folders are discovered from the main
  world folder, so all three dimensions list and stream.
- Material list — a Materials panel (View ▸ Materials, Cmd+4, or "Materials…"
  on the build card) rolls any open structure up into gatherable items with
  stack and shulker-box math: all states of a block as one row, doors and beds
  counted once, double slabs twice, candles/sea pickles/turtle eggs/snow layers
  by their live amount, source water/lava as buckets, and entities included.
  Exports machine-readable CSV or JSON.
- Orthographic plan views + measure — Top/Front/Side presets for layout work
  (near-orthographic, so plans read as plans) and a two-point measure tool:
  click two blocks, read the X×Y×Z span and straight-line distance.
- Datapack upgrader with a loss report — one action in the Worldgen Doctor
  upgrades the active workspace to its target Minecraft version: structure
  `.nbt`s re-stamped to the target `DataVersion` (surgically, on the NBT tag
  tree — and never downgraded: a file newer than the target is reported, not
  touched), the `structures/` → `structure/` folder rename applied,
  `pack.mcmeta` re-stamped in both the classic `pack_format` and the 26.x
  `min_format`/`max_format` schemes, and block ids that don't resolve at the
  target flagged. Every change and everything it could not map is listed —
  nothing is silently dropped.
- Doctor fix-its — the check-up's safe findings grew one-click **Fix it**
  buttons: move `.nbt`s to the folder the target version reads, inject the
  required `spawn_overrides: {}`, re-stamp a stale pack format. The report
  re-scans after each fix.
- `/place` everywhere — the copyable test command now also appears in the
  workspace-export success screen (`/place structure` with worldgen files,
  `/place template` without) and in the Jigsaw panel, so "did it assemble?" is
  always one paste away.
- Missing-texture diagnostics for worlds — the 2.1 structures feature extended:
  the world HUD counts block types rendering as flat colors in streamed chunks
  (hover for the list), only when a content pack is configured.
- Settings, one page of new knobs, each tied to a shipped behavior:
  **World** — default render distance, chunk memory cap (the "never OOM,
  degrade to LOD" budget), mesh worker threads (auto = scales with your CPU),
  default dimension on open (last used per world / always overworld), and a
  total size cap for backups alongside retention. **Viewer** — a
  colorblind-safe overlay palette (Okabe–Ito) for diff/void/selection marks,
  Y-slice memory, cursor readout verbosity. **Editor** — default tool on
  entering edit, plane-lock default, symmetry that persists across sessions,
  undo depth, and an unsaved-edit guard on tab close (warn / auto-save as a
  version / discard). **AI** — review screenshot size (the token/quality lever
  of the self-review loop) and library retention (keep the last N versions per
  build; generated libraries no longer grow unbounded). **Files** — default
  "Export As…" format, material-list export format, and reopen last session on
  launch (tabs + world).
- macOS file associations — `.nbt`, `.schem` and `.litematic` register with the
  OS, so double-click / Open With reaches Blockwright.

### Changed

- The backup retention setting now pairs with the new total-size cap: past
  either limit the oldest backup sets are pruned, and the newest set always
  survives whatever the cap says.

## [2.1.1] - 2026-07-05

Opens worlds saved by the newest Minecraft.

### Fixed

- Minecraft 26.x worlds now open — the 26.x saves moved the vanilla dimensions
  under `dimensions/minecraft/<path>/region/` (the overworld, nether and end no
  longer live in `region/`, `DIM-1/` and `DIM1/`). Every vanilla dimension now
  resolves through both the modern and the classic layout, so a save from either
  Minecraft generation streams its chunks — and an upgraded world reads its
  authoritative modern data first, without double-listing dimensions.
- The fly-through camera starts at the right place in a 26.x world — those saves
  moved the spawn into a `spawn` compound (`spawn.pos`) and the last player out
  to `players/data/<uuid>.dat` (named by `singleplayer_uuid`). Blockwright reads
  both the new and the classic `level.dat` shapes, falling back to spawn when the
  player file is absent.

## [2.1.0] - 2026-07-05

Compare, restyle, and showcase any build — current with Minecraft 26.2.

### Added

- Minecraft 26.x support — Blockwright now understands Mojang's year-numbered
  releases (26.1, 26.2, …). Workspace detection reads `26.x` version strings and
  the new `pack.mcmeta` `min_format`/`max_format` scheme (including fractional
  formats like `107.1`), jigsaw features and the size-limit `auto` setting resolve
  for the new line, worlds from a 26.x save open (verified against the 26.2 data
  format), and 26.2/26.1 join the manual version picker.
- Version-aware exports — the single `DataVersion` constant became a version
  registry: an export now stamps the DataVersion and data-pack `pack_format` your
  mod actually targets (resolved to the nearest known release, never newer), and
  Export to World reads the target save's own `level.dat` so pieces installed into
  a world match what that world runs.
- Structure Diff — the first file-vs-file visual schematic diff. File ▸ Compare
  with File… (or the new compare action on any entry in the Versions panel) marks
  every difference in the viewer — green added, red removed, yellow changed
  block/state — with a summary card of counts and a per-block rollup. "What did
  this AI run change?" is now one click, and the comparison is blockstate-aware,
  so a stair that flipped facing counts as changed while property order alone
  never does.
- Re-theme — File ▸ Re-theme Structure… swaps blocks across the whole build with
  the blockstate carried over intelligently (`oak_stairs[facing=east,half=top]` →
  `spruce_stairs` keeps facing and half — the thing find-and-replace re-themers
  corrupt). Map blocks by hand with per-block occurrence counts, or classify the
  palette into semantic roles and apply any registered decoration (cozy → haunted,
  oak → castle stone) in one click. Applies as a single undoable editor step,
  saves as a new version, and works on imported `.schem`/`.litematic` builds too.
- Beauty Render — File ▸ Render Image… exports a high-resolution PNG of the open
  build (up to 4096 px; transparent or themed background; preset camera angles:
  current view, hero ¾, isometric, front elevation, top-down and a cross-section)
  or records a full-orbit turntable WebM — showcase artifacts straight from the
  viewer, no Blender pipeline.
- Worldgen Doctor — File ▸ Workspace Check-Up… scans the active workspace's whole
  data pack (structure defs, template pools, structure sets, biome tags,
  `pack.mcmeta`, the structure folder itself) and reports every silent failure it
  finds with a fix-it explanation: missing `spawn_overrides`, dead start pools,
  empty biome tags, `separation ≥ spacing`, dangling structure references,
  `.nbt`s in the folder the target version doesn't read, stale pack formats,
  oversized structures, and more — caught before launching the game.
- Watch mode — the open structure file is now watched on disk: an external edit
  (VS Code, an Axiom export, a datapack build script) hot-reloads the viewer in
  place, and new files appearing in the workspace's structure folder show up in
  the Project panel by themselves. Reloads never clobber unsaved editor work or an
  in-flight generation.
- Deep air/void editing — the Void tool can now reach behind the first surface:
  Alt+scroll (or a stepper) pushes the target cell deeper along your aim, with the
  hover ghost and cursor readout following, and a new "Fill selection box" action
  writes a whole multi-layer air/void region in one undoable step (solid blocks
  are never overwritten).
- Editor quality-of-life — number keys 1–9 switch tools (matching the rail order,
  shown in each tooltip), Esc always walks back to a neutral state (cancel
  eyedropper → back to Select → clear selection), Alt+click samples a block from
  any tool with a block field (Paint/Replace/Stairs), a paint or void stroke is
  locked to the plane it started on so a drag never jumps depth mid-stroke (and
  can bridge gaps in a wall), and an on-canvas hint chip names the active tool
  with its live modifier keys.
- Jigsaw piece list — after generating an assembly, the Jigsaw panel lists every
  placed piece with its offset; clicking one opens that piece's file in a new tab,
  so pool authors can iterate on the piece they're looking at.
- Missing-texture diagnostics — the Inspector now summarizes how many block types
  fell back to flat colors (hover for the list), and the World Viewer logs each
  unresolvable block id once to the Console dock instead of silently rendering it
  flat.
- Guide section for the new tools — "Compare, re-theme & render" covers Diff,
  Re-theme, Render, the Worldgen Doctor and watch mode, in English and pt-BR like
  everything above.
- Upgrade groundwork — every loaded structure now records its source `DataVersion`
  into the library's `.bw.json` metadata sidecar, the prerequisite for a future
  "upgrade with a loss report".

### Fixed

- Stacked air/void layers now all show — a build with several `structure_void`
  layers used to reveal only the outermost one in the "show voids" overlay.
  Interior cells now render as dimmed markers, so a multi-layer region reads
  layer by layer instead of disappearing (bulk captured air stays summarized to
  avoid fog).

### Changed

- The version picker offers 26.2, 26.1 and 1.21.11 first, and unknown data-pack
  formats between known releases now detect as the nearest known family instead
  of failing to a manual prompt.

## [2.0.2] - 2026-07-03

### Added

- Structure block data — data-mode structure blocks now surface their metadata
  string. The Inspector lists it (grouped by string, with a `data` chip, a copy
  button and a focus jump), and the block editor can edit it in place through a
  new "Structure data" field: type a marker string, and a freshly painted
  structure block gets a minimal data block entity minted for it. The edit rides
  along through every editing op and is merged back into the file on save, so
  data markers — a mod's spawn/trigger hooks — can now be authored entirely in
  Blockwright.
- Export as NBT and Export as Jigsaw are now separate File-menu actions. Export
  as NBT… saves a single file at any size (mods load arbitrary sizes, so it is
  never split), while Export as Jigsaw… — enabled only once a build exceeds the
  size limit — cuts an oversized structure into a jigsaw assembly that snaps back
  together voxel-perfect in-world.

### Changed

- Reworked welcome screen.
- Updated the in-app guide — the Export section now covers the split NBT / Jigsaw
  actions and the supported formats.
- Dependency upgrades.

## [2.0.1] - 2026-07-02

### Added

- Empty-file state — opening an `.nbt`/`.schem`/`.litematic` that parses fine but
  places zero blocks now shows a clear "no blocks in this file" card instead of
  the build planner, so an empty capture or another tool's placeholder is reported
  as a fact about the file rather than an invitation to generate.

### Changed

- New app icon and logo — a single squircle artwork used everywhere, replacing the
  separate light/dark logo variants.
- Project panel structure list is cleaner — it now lists only the real structures
  directly under a workspace's `structure` folder: jigsaw-split piece fragments in
  subfolders and zero-block placeholder files (e.g. GameTest `empty_NxN` templates)
  are filtered out, while a file that fails to parse still surfaces so its real
  error shows on open.
- Dependency upgrades.

## [2.0.0] - 2026-07-01

### Added

- World Viewer — open a whole Minecraft save (`level.dat` + `region/*.mca`) and
  fly through it as a view-only world. It streams chunks around the camera with
  level-of-detail (full geometry up close, a textured heightmap surface farther
  out), meshes them off the main thread, and never modifies the world. Includes a
  2D minimap, a go-to coordinate jump, a structure finder that scans and jumps to
  any generated structure, a day/night lighting toggle, and a dimension switcher
  (vanilla and mod dimensions with region data on disk). Open it from File ▸ Open
  World… (Cmd+Shift+W), the welcome screen or recents. Supports 1.13+ paletted
  worlds.
- Church structure type — a long buttressed nave under a steep gabled roof with
  tall arched windows, fronted by a square bell tower that rises to a stepped
  spire topped by a cross (its roof and steeple are built in code).
- Chapel decoration — whitewashed plaster over dressed stone with a steep dark
  roof; the church's default look.
- Theme picker — Settings ▸ Appearance now shows a gallery of theme cards (each a
  miniature workbench preview) in place of the old light/dark toggle, and adds two
  Minecraft skins: Minecraft Light (launcher charcoal on paper white) and
  Minecraft Dark, both with the grass-green accent. System still follows your OS.

### Changed

- UI 2.0 — an IDE-grade workbench redesign: a left ActivityBar icon rail, a
  toggleable Project panel (active workspace, its structures, and recent files /
  workspaces / worlds), a reworked Welcome start page, a single slim tab bar, and
  an active-workspace segment in the status bar (replacing the floating badge).
- Structure types renamed to form-descriptive ids — the id now names the
  silhouette and the theme lives in the paired decoration: classic → cottage,
  modern → villa, gothic → manor, sakura → raised-cottage, tower-classic → keep,
  haunted-tower → spire. Saved builds using the old ids keep working.
- Updated the Claude model lineup (Opus 4.8, Sonnet 5) — the current models use
  adaptive thinking steered by an effort level.
- Entities now render in the World Viewer, and entity rendering was reworked.
- Dependency upgrades.

### Fixed

- Switching the mod workspace while a world is open now soft-refreshes the
  streamed chunks so mod textures resolve, instead of leaving the old ones.
- Entity rendering in the world.

## [1.4.1] - 2026-06-29

### Changed

- Generation card overhaul — the chat build card was reworked, and now surfaces
  the active mod workspace's block-usage preference (off / mix / prefer) when
  generating with a mod loaded.
- Floating windows (Controls / Inspector / Jigsaw) are now translucent.
- Dependency upgrades.

### Fixed

- Tower generation — a tower now reserves only its small code-built crown instead
  of paying a phantom pitched-roof height, so its storey budget and exterior come
  out right.

## [1.4.0] - 2026-06-26

### Added

- Round-trip editing — take a structure out of Blockwright, edit it anywhere
  (including with vanilla Structure Blocks), and bring it back:
  - **Export for Editing…** writes the build out for external editing, cutting an
    oversized structure into its jigsaw pieces.
  - **Export with Structure Blocks…** installs an editing datapack into a save —
    each piece appears in its own outlined box; edit it, save the structure block,
    then stitch the pieces back together.
  - **Open Jigsaw Assembly…** reopens a previously-split assembly folder back into
    Blockwright.
  - **Reimport from World…** stitches the edited pieces back into a single
    structure, committed as a new version of the project.
- Rename Project — rename a project's folder and its structure file (handy before
  exporting, so a build doesn't carry its generated name).
- Generate with the mod's own blocks — the workspace block dictionary now feeds
  generation, mapping semantic roles to the mod's blocks (off / mix / prefer) so
  a seeded shell can compile in the mod's materials.

### Changed

- Versions overhaul — one version per AI run, a "Current" base pointer that every
  export, manual save and AI edit builds on, version deletion, and block editing
  locked while a run is in flight.
- Reworked the export options — consolidated the local-export, slice, merge and
  reassemble internals behind the new round-trip flows.
- Dependency upgrades.

### Fixed

- Flatpak build.
- Underground access on towers — the descent ladder no longer ends up outside the
  tower.
- Haunted tower and graveyard generation.
- Structure-block export.

## [1.3.0] - 2026-06-26

### Added

- Big structures that exceed the Structure Block size limit (48×48×48, or 32³
  before 1.16) are now exported as a jigsaw assembly — cut into a grid of pieces
  that reassemble voxel-perfectly in-world, so a structure that previously
  wouldn't load now does. Every export path (mod workspace, Export As, Export to
  World) handles it automatically.
- Export to World — install the current build straight into a Minecraft save as
  a ready-to-run datapack, with the exact `/place` command to spawn it (and a
  one-click copy).
- NBT size-limit setting (Settings ▸ Viewer ▸ Structures) — Auto (from the
  workspace's Minecraft version), 48³ (1.16+) or 32³ (pre-1.16). Above the limit,
  export switches to the jigsaw assembly.
- Flatpak packaging for Linux.

### Changed

- Entities (armor stands, item frames, mobs) are now carried through format
  conversions and the jigsaw split instead of being dropped.
- Reworked the export internals (split engine, a shared file writer, and a
  dedicated local-export module).
- Dependency upgrades.

### Fixed

- Blank/white window on hosts without a usable GPU (VMs, headless, and some
  Wayland/Flatpak setups) — the app now falls back to software rendering
  (SwiftShader), and `BW_SOFTWARE_GL=1` forces it.
- Block-editor edits now stay within the structure's declared size — no more
  placing or extruding blocks out of bounds.
- Text alignment in the in-app Guide.

## [1.2.0] - 2026-06-24

### Added

- Paint and air/void tools in the block editor — a paint tool with brush,
  recolor and flood-fill modes (with a hover preview ghost and live symmetry),
  plus a void tool and a "Show voids" toggle that reveal the otherwise-invisible
  `air` and `structure_void` cells (air in blue, void in red, matching
  Minecraft's show-invisible-blocks colors).
- Tooltip primitive — a richer hover/focus bubble that replaces bare `title=`
  attributes, portal-rendered so it can't be clipped by the 3D canvas.
- macOS dock icon, and a "Check for Updates…" item under the application menu.

### Changed

- Reworked the tooltip implementation.
- Dependency upgrades.

### Fixed

- Render blocks taller than two cells correctly.
- Void rendering and the air/void overlay toggle.

## [1.1.1] - 2026-06-23

### Fixed

- Update notifications on macOS and Linux — the existing auto-updater only
  installs where Squirrel can (Windows, and a signed + notarized macOS build),
  so on the unsigned macOS build and on Linux it silently did nothing. The app
  now detects a newer GitHub release and surfaces it in-app — a dismissible
  banner, a status card in Settings ▸ About, and Help ▸ Check for Updates… —
  each linking to the download.

## [1.1.0] - 2026-06-23

### Added

- In-app block editor — select, move, mirror/rotate, extrude, build stairs,
  place, replace and delete blocks directly in the 3D viewer, with live
  symmetry, undo/redo and save-as-new-version.
- Export to mod workspace — write a structure into the active workspace's data
  pack as a version-correct `.nbt`, optionally generating the jigsaw worldgen
  files (structure def, template pool, structure set and biome tag) that make
  Minecraft spawn it.
- WorldEdit `.schem` (Sponge) and Litematica `.litematic` interop — open and
  export both formats, with block entities carried through every conversion.
- A new haunted tower structure type.

### Changed

- Reworked structure parsing and editing internals.
- Dependency upgrades.

### Fixed

- Localization (i18n) corrections.

## [1.0.0] - 2026-06-15

First public release.

### Added

- Real-time 3D rendering of Minecraft `.nbt` structures with Three.js.
- AI structure generation from a prompt or reference image through an
  emit → render → review loop, on your own Claude (Pro/Max) or Codex (ChatGPT
  Plus/Pro) subscription — with Saver / Balanced / Thorough cost presets.
- Composable generation domain — structure types (house family + tower keep),
  decorations, roofs, basements, attics, per-floor rooms and code-built
  surroundings, browsable with live 3D previews in the Module Gallery.
- Floor-plan editing with viewer bands carried as context on every prompt.
- A browsable structure library — one folder per build with kept versions and a
  generation log.
- Mod workspace support with namespace-aware asset resolution and auto-detected
  target Minecraft version.
- Jigsaw assembly preview, Block Catalog browser, block-entity rendering and
  animated fluids.
- Configurable content-pack folder — point Blockwright at your own Minecraft
  extraction (the vanilla assets are not bundled).
- English and pt-BR localization, light/dark theming, and a self-screenshot mode
  for headless visual testing.
- Auto-update via update.electronjs.org (reads published GitHub Releases).

[2.2.0]: https://github.com/matheussartori/blockwright/releases/tag/v2.2.0
[2.1.1]: https://github.com/matheussartori/blockwright/releases/tag/v2.1.1
[2.1.0]: https://github.com/matheussartori/blockwright/releases/tag/v2.1.0
[2.0.2]: https://github.com/matheussartori/blockwright/releases/tag/v2.0.2
[2.0.1]: https://github.com/matheussartori/blockwright/releases/tag/v2.0.1
[2.0.0]: https://github.com/matheussartori/blockwright/releases/tag/v2.0.0
[1.4.1]: https://github.com/matheussartori/blockwright/releases/tag/v1.4.1
[1.4.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.4.0
[1.3.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.3.0
[1.2.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.2.0
[1.1.1]: https://github.com/matheussartori/blockwright/releases/tag/v1.1.1
[1.1.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.1.0
[1.0.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.0.0
