# 08 — Complex structures, references & advanced gotchas

The earlier files get you a correct single building. This file is for the hard cases:
**big/modular builds, multi-floor layouts, working from reference `.nbt` files and reference
images, and the gotchas that only bite at scale.** Read [`07-workflow.md`](07-workflow.md)
first — this extends it.

## What Blockwright actually renders (fidelity table)

The preview is your validation loop, so you must know what it shows. Generate to match the
*intent*, but **only trust the preview for things in the "Rendered" column.**

| Thing | Rendered in preview? | Notes |
|-------|----------------------|-------|
| Normal blocks (planks, stairs, slabs, glass, fences, doors…) | ✅ geometry + texture | The bulk of any build. |
| Chests / trapped chests | ✅ synthesized geometry | Single/double from `type`; no items shown. |
| Beds | ✅ synthesized geometry | Both halves; color from block ID. |
| **Wall** banners | ✅ tinted cloth | Color from `<color>_wall_banner`; **patterns not shown**. |
| Water / lava | ✅ full cube | From the animated "still" texture; water is biome-tinted blue. |
| Container **contents** (`Items`) | ❌ | Correctness only — invisible in preview. |
| Sign / hanging-sign **text** | ❌ | Geometry of the sign shows; the text does not. |
| Banner **patterns**, **standing** banners as cloth | ❌ | Plan around it; use wall banners if you need visible cloth. |
| `entities` (item frames, paintings, mobs, armor stands) | ❌ | Entirely absent from preview. Use only when the request needs them. |
| Unknown / misspelled block ID | ⚠️ flat fallback color | A **visible failure** — catch it and fix the ID. |
| Grass/foliage tint | ✅ approximate | Biome tint is a fixed approximation, not per-biome. |
| `minecraft:light` (invisible light) | ❌ shows as empty space | **Don't use it** — invisible, command-only, and often fails to light a placed structure. Light with visible fixtures ([`03`](03-blocks-and-blockstates.md)). |

Implication: build interiors out of **block geometry** (faux-furniture), not out of items or
sign text, because that's what previews accurately. See [`06`](06-decoration-and-interiors.md).

## Generating large builds without errors

A 20×20 build is thousands of cells. Discipline that prevents the common failure modes:

- **Loop, don't hand-place.** Reason about the build as nested loops over `(x,y,z)` with a
  predicate per region (floor / wall ring / window course / roof slope). Emit one `blocks`
  entry per non-air cell. This is what keeps walls gap-free and avoids off-by-ones.
- **Build the palette first, then index it.** Decide every distinct block *state* up front,
  assign each a fixed index, and reference indices while placing. Adding a new state late means
  appending to the palette — **never renumber existing indices** (every `blocks[].state` would
  shift).
- **Don't mutate a shared palette entry.** If 200 blocks point at `state 5` (oak_planks) and
  you want *some* of them waterlogged, add a **new** entry; editing entry 5 changes all 200.
- **Keep a region map in your notes.** e.g. "y=0 floor; y=1..4 walls; y=5 wall-plate; y=6..9
  roof; door at (4,1..2,8)". You'll need it for edits and for the handoff note.
- **Tight bounding box.** `size` must equal `maxPos+1` per axis. Padding wastes file size and
  makes the placement footprint wrong. Re-derive `size` after any change that adds height/width.
- **De-duplicate as you go.** Two identical block states = one palette entry. A bloated palette
  is a smell that you forgot to reuse an index.

## Modular & symmetric builds (rotation / mirror)

Big builds are usually **one module repeated** (a wall bay, a tower, a wing). Design the module
once, then place copies — but **every copy must rotate/mirror its `facing`/`axis`/`shape`**, or
stairs and doors point the wrong way.

> **Prefer the transform ops** (`mirror`/`rotate`/`repeat`, see
> [`00-volumetric-ops.md`](00-volumetric-ops.md)) over doing this by hand: they copy the cells AND
> rewrite the orientation blockstates for you, so the copy is correct automatically. Build the
> module/half once with fill/hollow ops, then `mirror` it across the centre, `rotate` it about the
> building's pivot, or `repeat` it along a facade. Hand-rotation (below) is only needed when you
> can't express the copy as one of those ops. The conventions are identical either way:

Use the conventions from [`02`](02-coordinates-and-layout.md). For a clockwise quarter-turn
(viewed from above):

- Position within a `W×L` footprint (`W` along x, `L` along z): `(x, z) → (L−1−z, x)`; the new
  footprint is `L×W`. (Matches Minecraft's `CLOCKWISE_90`; see [`02`](02-coordinates-and-layout.md)
  for the CW_180/CW_270 forms.)
- `facing`: `north→east→south→west→north`.
- `axis`: `x↔z` swap (`y` unchanged).
- Stair `shape` corners (`inner_left`/`outer_left`…) also rotate — easiest to re-derive corners
  per orientation rather than rotate the string.

For **mirroring** (e.g. a symmetric west wing from an east wing): mirror the axis (`x → W−1−x`),
and swap the mirrored `facing` (`east↔west` for an X-mirror; `north↔south` for a Z-mirror) and
door `hinge` (`left↔right`). Mirror stairs `shape` left↔right too.

> Simpler when possible: keep the *whole* build in one orientation and let world placement
> rotate it. Only rotate **internal** modules by hand. After any rotate/mirror, re-preview that
> module specifically — wrong-facing stairs are the #1 symptom.

## Vertical zoning: basement → floors → attic

A multi-level build is a **stack of storeys in `y`**, bottom to top:
`basement → ground floor → upper floor(s) → attic → roof`. Plan the whole stack first, then emit
it layer by layer.

### The mental model (read this before building a basement)

Structure coordinates are **local and never negative** — `pos[1]=0` is the lowest cell of the
*file*, not "ground level". So **"below ground" is not negative `y`**; a basement is simply the
**lowest layers of the structure**, with the ground floor stacked on top of it. The whole build
then gets *placed* so those bottom layers sit underground.

- Pick a **"ground line"**: the `y` value that represents the world surface (e.g. the ground
  floor's floor at `y=4` if there's one basement storey below). Everything below it is
  below-grade.
- **Report the ground line in your handoff note** (see [`07`](07-workflow.md)) so the build is
  placed at the right depth — its origin goes `groundLineY` blocks *below* the surface, so the
  ground floor lands at surface level and the basement ends up buried.
- This is the same reason foundations build *up* from `y=0` ([`02`](02-coordinates-and-layout.md)),
  not down — the file has no negative space.

### Storey mechanics (every level)

- A storey ≈ `floor course (1) + interior air (≥3) + ceiling course (1)` ≈ 5 blocks. Each added
  storey ⇒ ~+5 to `size.y`. A floor course **doubles as the ceiling** of the storey below — place
  it once.
- **Stairwell:** vertical circulation needs a **2-high headroom hole cut in the floor above** the
  stair run, or the player hits their head. Stack the stairwell in the **same footprint on every
  level** (one shaft) when you can — it's cleaner and reads as real.
- **Interior walls** are 1-block partitions on the interior grid; leave a 1×2 doorway. Keep rooms
  ≥ 3×3 interior so furniture fits.
- **Plan top-down per level** (a grid like [`02`](02-coordinates-and-layout.md)'s), then align
  windows/doors/stairwell **vertically** between levels so the facade and load path read right.
- **Re-derive `size.y`** after adding any level: `basement + Σ storeys + attic + roof`, and recheck
  every `pos` is in bounds.

### Basement / cellar (the lowest layers)

- Occupies `y=0 .. groundLine−1`. Walls are **solid foundation** (`stone_bricks`, `deepslate`,
  `cobblestone`, `tuff`) — no normal windows, since it's buried.
- **It will be dark** — there's no daylight. Light it deliberately with **visible** sources:
  `lantern`s/`soul_lantern`s (hung from the ceiling), `glowstone`/`sea_lantern` behind trapdoors,
  `candle`s, `redstone_torch`. **Do not use `minecraft:light`** — it's invisible, command-only, and
  often fails to light a placed structure ([`03`](03-blocks-and-blockstates.md)). A black, unlit
  basement reads as a hole.
- **Access:** a stairwell down from the ground floor (headroom hole cut in the ground-floor floor).
- **Window wells** (optional): if you want a sliver of light, recess a small light shaft up to the
  surface and put `glass`/bars at the top.
- Natural fit for storage/utility: `barrel`s, `chest`s, `bookshelf`, `brewing_stand`, `cauldron`,
  damp accents (`mossy_*`, `cobweb`). A great match for a **dark, grey** theme — lean into it.

### Attic / loft (inside the roof volume)

- Sits in the space **under a pitched roof**, so the **ceiling slopes** — usable floor is the
  central band where headroom ≥ 2; tuck furniture (beds, `chest`s, `barrel`s, carpets, low
  shelves) under the slopes and keep the walkway down the tall middle.
- **Light it from the roof:** **dormers** (a small gable poking out of the slope with a window),
  **skylights** (swap a roof cell for `glass`), or windows in the **end gables**. Dormers are the
  classic, characterful choice ([`10`](10-design-principles.md) §Roofs).
- **Access:** a ladder or stair up through a headroom hole, often with a `trapdoor` hatch in the
  attic floor.
- Floor = the top storey's ceiling. Leave the very top under the ridge as decorative dead space if
  headroom is too low there.

### Worked vertical section (one basement, ground floor, attic)

`size.y = 13`; ground line at `y=5`. Side view (one column of the stack):

```
y=12  ^             roof ridge
y=11 / \            roof slope (stairs) + a dormer/skylight for the attic
y=10/   \   ATTIC   sloped ceiling; low furniture under the eaves
y=9 #####  ───────  attic floor  = upper ceiling
y=8 #   #   GROUND  interior air (windows in these courses)
y=7 #   #   FLOOR
y=6 #   #
y=5 #####  ───────  ground floor  = the GROUND LINE (world surface here)
y=4 #   #  BASEMENT interior air (no windows; lit by lantern/light)
y=3 #   #   /CELLAR
y=2 #   #
y=1 #####  ───────  basement floor
y=0 #####            foundation slab (lowest cell of the file)
```

Place a stairwell hole through the floor courses at `y=5` (down to cellar) and `y=9` (up to
attic), stacked in the same footprint, each with 2-block headroom above its steps. Tell the user
the **ground line is `y=5`** so it's buried correctly.

## Terrain, water & waterlogging

- **Waterlogging:** many blocks (stairs, slabs, fences, signs, trapdoors, lanterns…) have
  `waterlogged: "true"` — water occupies the same cell as the block. For an **underwater** build,
  waterlog the see-through/partial blocks rather than placing separate water cells. Full solid
  blocks can't be waterlogged.
- **Standing water/lava:** place `minecraft:water` / `minecraft:lava` (they render as full
  cubes). `level` `"0"` = source. Flowing levels exist but render the same here — use sources.
- **Foundations on slopes:** structure positions can't go below `y=0`, so build the foundation
  *up* from `y=0`; the build's lowest course is its footing. Skirt the base in `cobblestone`/
  `stone_bricks` to ground it. (For a **basement**, the same rule means the cellar is the lowest
  layers and the placement is buried — see §"Vertical zoning" above.)

## Working from reference `.nbt` files

A reference is "imitate this / build on top of this". The app parses it into the same authoring
JSON (palette + indexed blocks). Treat it as data, not just a picture:

- **Extract the material theme.** Read its `palette` and reuse the exact block IDs/properties so
  your build matches the reference's look.
- **Read the real proportions.** Use its `size` to keep your dimensions in range, and to learn
  the builder's wall thickness, roof pitch, window rhythm.
- **Lift patterns.** Copy a roof technique, a Tudor framing pattern, a furniture recipe — then
  adapt materials to the new request.
- **Extend / merge (the common ask: "add a second floor", "attach a wing"):**
  1. Keep the reference's blocks **at their original coordinates** so the join lines up.
  2. **Merge palettes**: append the reference's distinct states to yours (or vice-versa) and
     **remap** the side being moved — when you concatenate two palettes, the second file's
     `state` indices must shift by the length of the first.
  3. Add your new cells (bump `size` on the growing axis; new floor sits at `y = oldMaxY+1…`).
  4. **Don't silently rewrite existing blocks** unless the request implies it. Add/modify only
     what was asked; preserve the rest exactly.
- **Coordinate joins:** to attach along +X, the new piece starts at `x = oldSizeX` (no overlap)
  or `x = oldSizeX−1` if they share a wall. Keep a shared wall single-thickness, not doubled.

## Working from a spec sheet / blueprint

Some references aren't photos — they're **design documents**: a labelled block palette, an
explicit footprint (e.g. "19×15"), a storey count, per-floor plan diagrams, and a vertical
section. When the reference gives you data like this, **don't interpret — transcribe.** This is a
precision copy, and it's the *easiest* kind of reference to nail because the decisions are already
made.

1. **Read the palette list → build your `palette`.** Each named block ("Deepslate Bricks", "Soul
   Lantern", "Blood Red Carpet" → `red_carpet`, "Spruce Trapdoor") becomes one entry. Map every
   listed material to its 1.21.1 ID up front, before placing anything.
2. **Read the dimensions → fix `size`.** "Pegada 19×15" + "3 níveis (porão + térreo + andar)" fixes
   `size.x`/`size.z` exactly and constrains `size.y` (≈ basement + Σ storeys + roof, ~5 each — see
   §Vertical zoning). Don't round the footprint to a square.
3. **Read each floor plan → lay out that storey.** The per-floor diagrams ARE the top-down grids
   §Vertical zoning tells you to draw. Place interior walls, doorways, the stairwell (stacked in
   the same footprint across floors), and faux-furniture where the plan shows them.
4. **Read the section → fix vertical placement.** The cross-section shows pé-direito (storey
   heights), where chains/lanterns hang, and the basement layout. Match it — the preview's vertical
   cross-section screenshot is exactly this view, so you can compare 1:1.
5. **Honour the "details/tips" notes.** A spec usually lists atmosphere rules ("pouca luz; lanternas
   de alma, tochas de redstone, velas"; "correntes penduradas"; "interior irregular"). Treat them
   as constraints, not suggestions.

Build it floor-by-floor with `mode:"full"` for the first complete pass, then `mode:"patch"` to fix
whatever the screenshots reveal against the plans.

## Working from reference images

Images give **style, silhouette, color, proportion, mood** — not exact blocks. Translate, don't
trace.

- **Estimate scale from known objects.** A door ≈ 2 blocks tall; a storey ≈ 4–5; a human ≈ 2.
  Count storeys/windows in the image to fix the height, then read width/depth off the facade
  proportions. Pick a footprint that preserves the aspect ratio.
- **Silhouette first.** Get the massing right (roof shape, number of volumes, tower vs. box)
  before any detail — the silhouette is what makes it recognizable.
- **Material mapping** (closest 1.21.1 block to a real material):

  | In the image | Block(s) |
  |--------------|----------|
  | White plaster / stucco | `white_terracotta`, `white_concrete`, `calcite`, `diorite` |
  | Dark timber framing | `dark_oak_log`/`_wood`, `spruce_log` (Tudor: logs over light infill) |
  | Red brick | `bricks`, `red_terracotta`, `mud_bricks` |
  | Grey stone / castle | `stone_bricks` (+`mossy_`/`cracked_`), `cobblestone`, `andesite`, `deepslate_bricks` |
  | Sandstone / desert | `sandstone`, `smooth_sandstone`, `red_sandstone` |
  | Concrete / modern glass | `*_concrete`, `smooth_quartz`, `glass`, `gray_concrete` |
  | Wood siding / cabin | `*_planks`, `*_log`, `stripped_*_log` |
  | Roof — terracotta tile | `*_stairs` in `bricks`/`granite`/`nether_brick` (warm), or `*_glazed_terracotta` |
  | Roof — slate / dark shingle | `dark_oak_stairs`, `deepslate_tile_stairs`, `blackstone_stairs` |
  | Roof — thatch | `hay_block`, `*_wool` stepped with stairs |
  | Foliage / gardens | `*_leaves`, `oak_log`, flowers, `grass_block`, `moss_block` |

- **Windows:** read their grid (how many, how wide, spacing) and reproduce the rhythm with
  `glass_pane`/`glass`; add stair/slab sills or trapdoor shutters for the framed look.
- **Mood → lighting & decoration** ([`06`](06-decoration-and-interiors.md)): warm/cozy =
  lanterns + campfire + wool; cold/grand = sea lanterns + stone + banners; ruined = cobwebs +
  mossy/cracked + missing blocks.
- **You can't pixel-match.** Capture the silhouette, the 2–3 dominant materials, and the standout
  feature; note the mapping choices you made so the user can correct them.

## Block entities you'll meet in references (but rarely author)

These appear in worldgen/reference files; you usually don't generate them, but recognize them:

- **`minecraft:jigsaw`** — a worldgen connector block. Blockwright has full jigsaw support
  (pools, assembly preview); it carries `name`/`target`/`pool`/`final_state`/`joint` NBT. Only
  relevant when generating **worldgen template pieces**, not standalone houses. Preserve its NBT
  verbatim when copying a reference.
- **`minecraft:structure_block`** (`mode`) and **`minecraft:structure_void`** — the void is an
  "ignore this cell on placement" marker; keep it if present in a reference.
- **`minecraft:spawner`** (`SpawnData`/`SpawnPotentials`), **`trial_spawner`**, **command
  blocks** (`auto`,`Command`), **`vault`** — gameplay block entities. Copy their NBT as-is from a
  reference; don't invent it.

## Advanced gotchas recap

- **Never renumber palette indices** after blocks reference them — append only.
- **One palette entry per distinct state**; don't mutate a shared entry to change a subset.
- **Re-derive `size`** after any dimensional edit; it must be `maxPos+1` on every axis.
- **Rotate/mirror also rewrites `facing`/`axis`/`shape`/`hinge`** — not just positions.
- **Waterlog partial blocks** for submerged builds instead of stacking separate water cells.
- **Never light with `minecraft:light`** — it's invisible, command-only, doesn't render in the
  preview, and often fails to light a placed structure. Use visible fixtures (lanterns, candles,
  glowstone, sea lanterns, redstone torches…).
- **Multi-floor stairwells need headroom holes** cut in the floor above.
- **A basement is the lowest layers, not negative `y`** — pick a "ground line", build up from
  `y=0`, and report the ground line so the build is placed buried.
- **Merging two files shifts the second's `state` indices** by the first palette's length.
- **Preview only validates geometry** — items, sign text, banner patterns, and entities are
  invisible (fidelity table above). Validate those by data check, not by eye.
