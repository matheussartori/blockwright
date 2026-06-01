# 10 — Design principles: making builds look intentional

Files [`05`](05-building-houses.md) and [`06`](06-decoration-and-interiors.md) tell you *how to
place blocks*. This file tells you *what makes the result look like a real builder made it*
rather than a hollow box. **A technically valid structure is not the same as a good-looking
one.** When a prompt says "a nice house", these are the moves that deliver "nice".

The single biggest tell of a beginner build is a **flat, single-material cube with a flat
roof**. Almost everything below is a way to break one of those three: flat surfaces, one
material, no depth.

## The six principles (apply all of them)

1. **Palette: 3–5 blocks, one tone, varied texture.** Never build a whole structure from one
   block. Pick a small set that shares a *temperature* (all warm or all cool) but differs in
   *texture* — e.g. `stone` + `cobblestone` + `stone_bricks` + `andesite` reads as one cohesive
   stone wall with life in it. Then add **1–2 accent** materials (a wood, a dark trim) used
   sparingly. More than ~5 materials reads as noisy.
2. **Depth: no surface stays flush.** Push some blocks in, pull some out. Insets, overhangs,
   pillars that jut, recessed windows/doors — anything that creates a *shadow line*. A wall on a
   single plane looks like cardboard; the same wall with a 1-block offset here and there looks
   built.
3. **Proportion: avoid the perfect cube.** Real buildings are rarely as tall as they are wide.
   Make the footprint a non-square rectangle, give rooms believable height (see below), and let
   the roof be a real fraction of the silhouette (~⅓ to ½ of the total height for pitched roofs).
4. **Detail hierarchy: big shape → medium breakup → small trim.** Get the massing and roof
   right first; then break up large faces (framing, string courses, pillars); then add small
   detailing (trapdoors, buttons, fences, lanterns). Don't sprinkle tiny details on a wrong
   silhouette.
5. **Grounding: the build meets the ground, doesn't sit on it.** A wider foundation course, a
   plinth, steps up to the door, plants and a path at the base — so it looks rooted, not dropped.
6. **Theme consistency.** Materials, lighting color, roof style, and decoration should all tell
   one story (cozy cottage / grand stone hall / modern glass). Echo the exterior palette inside.

## Walls & facades — kill the flat plane

A blank wall is the most common failure. Techniques, cheapest first:

- **Frame the structure** (Tudor/half-timber): `*_log axis:y` posts at every corner and every
  ~4–5 blocks along the wall, a horizontal `axis:x`/`axis:z` log **belt** at the top (and
  optionally mid-height), with `planks`/`terracotta`/`wattle` infill between. This single move
  reads as "designed". (See [`05`](05-building-houses.md) §Tudor.)
- **Mix the infill texture.** Replace ~10–20% of a plank/stone wall with a sibling block
  (`stripped_log`, `cobblestone`, `mud_bricks`) scattered, not in a stripe — adds "noise".
- **String courses / banding.** A horizontal line of `*_slab`, `*_stairs` (as a ledge), or a
  contrasting block at floor-division height visually splits a tall wall into storeys.
- **Insets & projections.** Recess a panel of the wall by 1 block, or project a pillar/chimney/
  bay out by 1. Even one offset per face transforms it.
- **Corner posts and base trim.** Different block at the corners (logs, `stone_bricks` quoins)
  and a 1-block base course (`cobblestone`, `deepslate`) bracket the wall.

> Rule of thumb: if you can see a wall face with no change in block, plane, or trim across more
> than ~5×5, break it up.

## Roofs — the biggest silhouette decision

Roofs make or break a build. Default to a **pitched roof with an overhang**, not a flat slab,
unless the theme is explicitly modern. Always **overhang the roof 1 block past the walls on all
sides** — the eaves' shadow line is what stops the roof looking glued on.

| Roof type | When | How (blocks) |
|-----------|------|--------------|
| **Gable (A-frame)** | Small/medium (≤~12 wide), the classic | Stairs stepping inward 1 per layer up both long sides; ridge = paired top-half stairs facing each other or `slab type:top`. Most common; start here. |
| **Hip** | Square-ish footprint, "tidier" look | Slopes on **all four** sides; corners use `shape:outer_*` stairs to miter the hip line; ridge meets at a point or short line. More work. |
| **Gambrel / barn** | Want attic volume | Two pitches: steep lower (full blocks/stairs near-vertical) → shallow upper (stairs/slabs). |
| **Mansard** | Large grand buildings | Like gambrel but slopes on all 4 sides; almost always add **dormers** for light. |
| **Saltbox** | Cottage with a lean-to | A gable with one slope much longer (extend one side down over an extension). |
| **Shed/skillion** | Sheds, modern, extensions | Single slope, one direction. |
| **Flat** | Modern only | Edge it with `slab`/backwards `stairs`/a parapet so it isn't a bare top; add roof access/garden. |

Roof technique notes:

- **Slope/pitch:** simplest is `oak_stairs` stepping in 1 block per layer (45°). For a gentler
  pitch, alternate `slab` and `stairs` (e.g. slab, stair, stair pattern) to rise ~5 over 7.
- **Ridge:** cap with `*_slab type:top` or two opposed `*_stairs half:top`, run it continuously —
  a broken ridge is an obvious hole.
- **Material:** roofs read best in a block *different* from the walls — `*_stairs` in
  `dark_oak`/`spruce`/`deepslate_tile`/`bricks`/`nether_brick` over light walls. Add a
  contrasting **trim course** (a line of slabs) along the eave.
- **Big builds (>~15×15) get multiple roofs.** One giant roof looks barnlike — break the
  building into sections/wings, each with its own smaller roof, intersecting at valleys.
- **Dormers** (a small gabled window poking out of the slope), **chimneys**, and a **gable-end
  detail** (a window, beam cross, or overhang with brackets) bring a plain roof to life.

## Doors & entrances — make the way in obvious

The entrance should be the **focal point**, not just a hole.

- **Recess the door** 1 block into the wall so it sits in a shadowed reveal; or **project a porch/
  portico** out in front (slab/stair roof on `*_fence` or `*_log` posts).
- **Frame it:** `*_log`/`stone_brick` jambs either side, a `*_slab`/`*_stairs` lintel or small
  gable over it, a `lantern`/`wall_torch` on each side.
- **Steps up to it** (1–2 stair/slab courses) plus a small landing — grounds the entry and adds
  verticality.
- **Scale to the building:** a grand hall gets **double doors** (two doors side by side, mirrored
  `hinge`) under an arch; a cottage gets a single door under a little gable.
- **Arches** (for stone/medieval): step the top of the opening with stairs (`half:top`) on each
  side meeting a center block — reads as a rounded/pointed arch.

## Windows — rhythm, framing, depth

- **Inset windows** by pushing the `glass`/`glass_pane` back 1 block from the wall face — the
  reveal frames them and adds the same shadow line as everywhere else.
- **Frame** with `*_slab`/`*_stairs` sills below, `trapdoor` shutters on the sides, a small ledge
  or flower box outside.
- **Rhythm:** repeat windows on a regular grid (e.g. 2-wide panes separated by 1–2 wall blocks),
  and **align them vertically** between storeys. Irregular, random windows read as a mistake.
- Use `glass_pane`/`iron_bars` for a paned/leaded look, full `glass` for big modern openings,
  `*_stained_glass` as an accent (chapel, feature wall).

## Rooms & interior layout (the design level; recipes in [`06`](06-decoration-and-interiors.md))

- **Believable height:** cottages ~3 air; halls/grand rooms 4–6; don't make rooms taller than
  they are wide unless it's a tower.
- **Zone by function** and give each room a clear purpose; connect them with doorways/halls, and
  always leave **circulation** — 1–2 blocks of walking space; never fill the floor.
- **One anchor per room** (bed / dining table / counter run / fireplace) placed against a sensible
  wall first, then supporting props around it.
- **Light every room** — a dark interior reads as unfinished. A source roughly every ~6 blocks,
  plus one feature light. Use `minecraft:light` ([`03`](03-blocks-and-blockstates.md)) only when
  the theme can't justify a visible fixture.
- **Echo the exterior theme** inside (oak build → oak furniture, warm lanterns).
- **Restraint:** 2–4 detail props per room. Negative space is part of the design; clutter reads
  as messy.

## Exterior & landscaping — builds don't float in a void

A build looks 10× better with a base treatment, even a small one:

- **Foundation/plinth:** a 1-block base course of `cobblestone`/`stone_bricks`/`deepslate`, ideally
  1 block **wider** than the walls, so the building has a footing instead of meeting the grass at a
  hard edge. Bury the bottom course slightly into terrain.
- **Path to the door:** `gravel`/`dirt_path`/`*_slab`/`cobblestone` walkway leading away from the
  entrance; line it with `*_fence`, `lantern` posts (a `*_fence` column topped with a `lantern`),
  or low hedges.
- **Planting:** `*_leaves`+`*_log` shrubs/trees, `flower`s, `grass_block`, `moss_block`, potted
  plants on sills, a `composter`/`barrel`/`hay_block` for a lived-in farmstead. A couple of trees
  and bushes "liven up the place".
- **Terrain tie-in:** if on a slope, step the foundation; add a small retaining wall, a pond
  (`water`, edged with slabs/stairs), or a garden bed. Don't leave a clean flat platform around
  the build.
- **Outbuildings & fences:** a low `*_fence`/`*_wall` enclosing a yard, a well, a small shed, a
  lamp post — context makes the main build read as part of a place.

## Style cheat-sheet (palette + roof + accents)

| Style | Walls | Roof | Accents & landscaping |
|-------|-------|------|----------------------|
| Cozy cottage | `oak_planks` + `cobblestone` base, oak-log framing | `oak`/`spruce_stairs` gable, overhang | flower boxes, lanterns, garden, path, chimney |
| Rustic farmhouse | `spruce_planks` + `cobblestone` + `stripped_log` | `dark_oak_stairs`, hay/thatch accents | barrels, hay bales, composter, fences, fields |
| Medieval stone | `stone_bricks` (+`mossy_`/`cracked_`) + dark-oak framing | `deepslate_tile`/`dark_oak_stairs`, steep, dormers | banners, arched doors, lamp posts, courtyard wall |
| Modern | `smooth_quartz`/`*_concrete` + `glass` | flat with slab parapet, or shed | large glass, hidden light, minimal plants, clean paths |
| Desert/Mediterranean | `smooth_sandstone` + `terracotta` accents | flat or low, `*_stairs` in warm tones | potted plants, archways, water feature |

## Good vs. beginner — quick audit before handing off

Catch these in the preview ([`07`](07-workflow.md)):

- ❌ One block for the whole build → ✅ 3–5 cohesive materials + accents.
- ❌ Every wall flat → ✅ framing, insets/projections, base + corner trim.
- ❌ Flat or no overhang roof → ✅ pitched roof, 1-block eaves, contrasting material, ridge.
- ❌ Door is a bare hole → ✅ framed/recessed entrance with steps and lights.
- ❌ Perfect cube proportions → ✅ rectangular footprint, roof = real fraction of height.
- ❌ Build sits on flat grass → ✅ foundation course, path, planting, terrain tie-in.
- ❌ Random/misaligned windows → ✅ regular rhythm, vertically aligned, framed/inset.
- ❌ Dark or empty/cluttered rooms → ✅ lit, zoned, one anchor + restrained props each.
