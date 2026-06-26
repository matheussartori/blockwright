# Changelog

All notable changes to Blockwright are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.3.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.3.0
[1.2.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.2.0
[1.1.1]: https://github.com/matheussartori/blockwright/releases/tag/v1.1.1
[1.1.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.1.0
[1.0.0]: https://github.com/matheussartori/blockwright/releases/tag/v1.0.0
