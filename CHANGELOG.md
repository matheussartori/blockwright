# Changelog

All notable changes to Blockwright are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[2.0.1]: https://github.com/matheussartori/blockwright/releases/tag/v2.0.1
[2.0.0]: https://github.com/matheussartori/blockwright/releases/tag/v2.0.0
[1.4.1]: https://github.com/matheussartori/blockwright/releases/tag/v1.4.1
[1.4.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.4.0
[1.3.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.3.0
[1.2.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.2.0
[1.1.1]: https://github.com/matheussartori/blockwright/releases/tag/v1.1.1
[1.1.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.1.0
[1.0.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.0.0
