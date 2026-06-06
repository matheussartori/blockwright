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
3. **Proportion & asymmetry: avoid the perfect cube.** Real buildings are rarely as tall as they
   are wide, and almost never a single symmetric box. Make the footprint a non-square rectangle,
   give rooms believable height (see below), and let the roof be a real fraction of the silhouette
   (~⅓ to ½ of the total height for pitched roofs). **Break the symmetry of the massing itself**,
   not just the surface detail: an L- or T-shaped footprint, a wing or lean-to off one side, a
   porch/bay/chimney projecting from one face, a tower or dormer on one corner, an off-centre
   entrance, one section a storey taller than the rest. A building whose four sides are
   interchangeable reads as a placeholder cube. Use `mirror` for *local* symmetry (a balanced
   facade) — but the overall silhouette should be irregular, with a clear front that differs from
   the back and sides.
4. **Detail hierarchy: big shape → medium breakup → small trim.** Get the massing and roof
   right first; then break up large faces (framing, string courses, pillars); then add small
   detailing (trapdoors, buttons, fences, lanterns). Don't sprinkle tiny details on a wrong
   silhouette.
5. **Grounding: the build meets the ground, doesn't sit on it.** A wider foundation course, a
   plinth, steps up to the door, plants and a path at the base — so it looks rooted, not dropped.
6. **Theme consistency.** Materials, lighting color, roof style, and decoration should all tell
   one story (cozy cottage / grand stone hall / modern glass). Echo the exterior palette inside.

## Physical validity — it must survive being placed in the world (non-negotiable)

A structure that looks fine in the preview but **breaks, floats, or makes no sense when placed
in a real world** is a failure, no matter how pretty. The preview renders blocks in isolation; it
does **not** simulate Minecraft's placement/support rules, so *you* must enforce them. Check every
one of these before handing off:

> **Compiler backstop (safety net, not a license to be sloppy).** Blockwright's compiler now
> auto-corrects the most common violations on its own: it re-seats or removes floating lanterns,
> drops floor torches/candles/carpets/plates with nothing solid under them, re-anchors or removes
> wall fixtures with no solid backing (or ones facing into a wall), seats floating `top` slabs onto
> the block below, clears anything sitting on a chest lid, opens doorways plugged by a wall, and carves
> stairwell headroom + a clear landing at the bottom AND top of every flight. Treat this as a net
> for slips — NOT permission to relax.
> A build that needs no fixes renders right the first time and spends fewer revision rounds, so still
> place everything correctly per the rules below; the rules and the compiler agree, the compiler just
> catches misses.

- **Nothing floats.** Every block must trace down to the ground through solid blocks, or be
  genuinely attached to something (a wall, a ceiling). A lone block, slab, stair, or fixture
  hanging in mid-air with air on all sides is the #1 "this is fake" tell. If you want a block up
  high, it needs a visible support: a pillar under it, a wall behind it, a chain/beam to a ceiling.
- **Ladders must be against a solid wall.** A `ladder[facing=X]` needs a **full solid block behind
  it** (on the side opposite `facing` — a `ladder[facing=south]` rests on the block to its north).
  A ladder with air behind it **pops off and breaks the instant the structure is placed in-game.**
  Never place a freestanding ladder column in open air to climb floors — run it flush against an
  interior wall, or build a 1-wide shaft and line one side of it with full blocks for the ladder to
  cling to. Same support rule for `wall_torch`, `wall_sign`, `wall_banner`, `lever`, `button`,
  `painting`, `item_frame`, `vine`, `tripwire_hook` — all need their backing block.
- **Lanterns and hanging fixtures attach, they don't hold things up.** A `lantern` either **sits on
  a solid block below it** (floor lantern) or **hangs with `hanging:"true"` from a solid block
  above it** (ceiling/chain/fence). A lantern is **not a structural support** — never put a lantern
  under a pillar, beam, or block and pretend it's holding it up, and **never embed a lantern in the
  middle of a pillar/column** (a lantern partway up a solid post reads as a glitch). That's
  backwards: the heavy block supports the light, never the reverse. Hang a chandelier as `chain` →
  `lantern[hanging=true]` *descending from the ceiling*, not as a lantern propping up a post. A
  hanging lantern with **nothing above it** (no ceiling/beam/chain it attaches to) is floating —
  put it on the floor instead, or give it something solid directly above to hang from. A lantern also
  **does not stick to the side of a wall**: a bare lantern sitting in the middle of a wall face, with
  air above and below it, is floating and wrong. For a light *on* a wall use a `wall_torch`, or set the
  lantern on a small bracket that projects from the wall (a `*_trapdoor`/`*_fence`/`*_slab`) so it has
  a solid block beneath it — never a lantern stuck flat to the wall.
- **Chains hang from a solid block above — and stay short.** A `chain` must connect to a solid block
  (or another chain) **at its top**; a chain with air above it floats and breaks. A pendant light is
  `chain[axis=y]` → `lantern[hanging=true]` dropping **a block or two** from the ceiling/beam — **do
  not run a long chain all the way down to the floor** to hold a lantern (it looks wrong and the
  point of a chain is to suspend a light *near the ceiling*). If a light needs to be low, set a floor
  `lantern` on a block instead of trailing a chain down to it.
- **Wall-mounted torches use `wall_torch`, not `torch`** — in the air cell against the wall, `facing`
  away from it, wall solid behind, never in the wall cell itself (that punches a hole). Full rules in
  [`03`](03-blocks-and-blockstates.md) §Torches & lights.
- **Gravity blocks need a floor.** `sand`, `red_sand`, `gravel`, `*_concrete_powder`, and anvils
  fall if the cell under them is air — keep a solid block beneath them.
- **Floor fixtures rest ON the floor — they are never on the ceiling or stuck to a wall.** A
  `cauldron`, `anvil`, `furnace`/`smoker`/`blast_furnace`, `flower_pot`/`potted_*`, `composter`,
  `decorated_pot`, `brewing_stand`, `cake`, `chest`/`barrel`, `campfire`, `candle`s, and floor
  `lantern`/`torch` all sit on top of a solid block, the right way up. **Never** hang a cauldron,
  furnace, or pot from a ceiling or float it high on a wall — it reads as a glitch (a cauldron stuck
  to the ceiling is nonsense). And never perch one over air or above a stairwell where it floats and
  blocks the passage. If you want something *hanging* from above, use the blocks made for it: `chain`
  → `lantern[hanging=true]`, a `*_hanging_sign`, or `vine`/`glow_lichen` — not a floor fixture.
- **Thin "floor decals" need a solid block directly beneath them or they pop off on spawn.**
  `*_carpet`, `*_pressure_plate`, rails, `candle`s, `flower`s/`sapling`s, `snow` layers, and
  `redstone` all break the instant the structure is placed if the cell under them is air. Lay them
  only on solid ground — never floated or bridging a gap/stairwell. **A `candle` rests on a *full
  solid block* — never on top of another candle**, slab, or fence: stacking a candle over a candle
  cell leaves the upper one floating (it can't stand on the candle below). To show more candles,
  raise the `candles` count (1–4) within the *same* block or spread them across separate
  solid-topped surfaces, not vertically.
- **Interactive blocks face the player, not the wall.** Any openable/usable block — `chest`/
  `trapped_chest`, `barrel`, `furnace`/`smoker`/`blast_furnace`, `loom`, `lectern`, `stonecutter`,
  `grindstone`, `anvil` — has a `facing` that is the side you open/use it from. When it's pushed
  against a wall (it almost always is), aim its **front at the open room** and its **back at the
  wall** — a `furnace` on a south wall is `facing:north`. A block whose front points **into** the
  wall (back to the room) can't be opened and reads as **placed backwards** — one of the most glaring
  mistakes, so set `facing` deliberately for each. Never bury the front; keep the cell in front of it
  clear so the player can reach it. A wall-side `barrel` can use `facing:up` instead.
- **Decoration never overwrites structure.** Furniture, lights, pots, carpets, and trim go in the
  **empty** cells of the build — they must not replace a wall, floor, ceiling, pillar, or any
  structural/load-bearing block. Because later ops overwrite earlier cells, dropping a decoration op
  on a cell already holding a wall or floor block **punches a hole** in the structure (a wall with a
  chest-shaped gap, a missing floor tile under a rug). Build the shell first, then place decor *into
  the air* beside/against it — never on top of a block the structure needs.
- **Cobweb is sparse decoration, not a building material.** `cobweb` is **not** a stair, ladder,
  scaffold, floor, or path — you cannot climb it or walk up it, and a diagonal run of cobwebs is not
  a staircase, it's just floating junk. Use it only as the occasional *single* strand tucked into an
  **open** corner or ceiling angle (in an air cell where two surfaces meet) for an "abandoned/cave"
  mood (and only when the prompt wants that). A cobweb is a **full-cube block**, so a cobweb sitting
  **flat on a flat wall face has replaced that wall block** and left a hole behind it — never place a
  cobweb on a wall, only in open air at a corner/ceiling angle. To actually move between heights, use
  the `stairs` op or a `ladder` flush to a wall (see below) — never a cobweb climb.
- **Doors actually block a doorway — no gap beside them.** A door fills a **1-wide opening in an
  otherwise solid wall**, both the lower and upper block of the opening, framed by solid blocks on
  *both* sides. If there's an empty (air) cell right next to the door, the door is pointless — you
  can just walk around it. Always seal the wall flush to the door's jambs. A door also needs a
  solid block beneath its lower half. Get `facing` (which way it opens) and `hinge` right so it
  swings into the room, not into a wall (catch this in the preview).
- **Stairs/ladders must lead somewhere — and they are not filler.** A staircase or ladder exists to
  connect two reachable places — a lower floor to an upper floor through a hole in the ceiling, the
  ground to a door. **Never** build a flight of stairs that climbs into a solid ceiling, ends at a
  blank wall, or stops in mid-air. Verify the top of every stair run opens onto a real walkable space
  (cut the floor/ceiling hole it climbs through) and the bottom meets a floor. A `*_stairs` block is a
  *shaped solid block*, not a decorative space-filler: **do not stack or scatter loose stairs in the
  middle of a room or in open air to "fill" it.** A pile of free-floating stairs sitting in a room is
  the clearest "fake build" tell of all — every stair must be part of a supported staircase, roof,
  or furniture piece, resting on or attached to something solid.
- **Build staircases with the `stairs` op — do not hand-place them.** The `stairs` op (`from`=bottom
  step, `to`=top step, `state`=a `*_stairs` block, `fill`=tread support, `clear`=air for headroom +
  the stairwell hole) guarantees a correct climbable flight: every step faces the ascent direction,
  the top step is always present, and there is exactly **one** run per rise. Hand-placing is what
  produces the classic breakages — a step facing the wrong way, an upside-down `half:top` step stacked
  on top that **blocks the climb**, or a **missing last step**. Never stack two runs over the same
  climb, and never list loose `*_stairs` for a flight when the op can do it. The op keeps **2 blocks of
  headroom** above each step and cuts the floor/ceiling hole to **just the footprint of the run** — no
  oversized shaft beside the stairs, solid floor at the bottom, flush landing at the top.
- **One circulation mechanism per shaft — pick stairs OR a ladder, never both, and never carve the
  shaft to air and leave it.** For a given vertical run, choose **one** method: a `stairs` op flight,
  **or** a wall-backed `ladder` column. **Do not** stack a `ladder` and a `stairs` op in the same
  shaft, and **do not** add `fill` ops of air through the shaft "to clear it" on top of a `stairs`/
  ladder — the op already cuts exactly the hole it needs, and a stray air-`fill` just guts the floors
  and walls, leaving an open pit with nothing to climb. A shaft must read as a deliberate stair or
  ladder, not a hole.
- **A ladder shaft is ONE continuous column that reaches EVERY floor it serves.** If you use a ladder
  to connect levels, run a **single unbroken `ladder` column** from the bottom floor all the way up to
  the top floor it serves (e.g. basement → ground → 2F → 3F → attic), flush against a solid interior
  wall, with a 1×1 hole through each floor it passes so the climb is unbroken. **Never** ladder only
  the bottom segment and leave the floors above with just an open hole and no rungs — that strands
  every upper floor (the #1 "can't get upstairs" bug). Every habitable floor and the attic must be
  reachable from the entrance by an unbroken stair/ladder chain; trace it floor by floor before you
  finish.
- **Walkways and rooms stay clear — don't block your own circulation.** A floor `lantern`, `torch`,
  `campfire`, pot, or any prop dropped in the middle of a corridor, doorway, or stair run blocks the
  path the player walks. Keep lights and props against walls or hang them from the ceiling so the
  1–2-block walking lane through every space stays open end to end.
- **Every door, opening, and balcony has a real means of approach — entry/exit must flow.** Wherever
  a player enters or steps out (a ground door, an upper-storey door, a balcony/terrace/varanda, a
  raised threshold), there must be a walkable path *to and through* it: steps/stairs up to a raised
  doorway, a stair or ladder up to a balcony, a landing on both sides of a door. A door opening onto
  a 3-block drop, or a balcony with no stair/ladder reaching it, is a dead access — the player can't
  get in or out smoothly. Build the approach (a short stair run, a stoop, a ramp) so movement in and
  out is fluid, never a jump or a fall.
- **A balcony is a real standing platform, not just the door sill.** A balcony/terrace/varanda must
  project a **floor of at least 2 cells deep × 3 cells wide of walkable space beyond the doorway**
  (more for a "large" balcony), edged on the open sides with a **railing** (`*_fence`, `*_wall`, or
  `iron_bars`) and supported underneath (corbels/`*_stairs half:top` brackets, posts, or a continued
  wall). The single row of blocks directly under the door is **not** a balcony — it reads as a glitch.
  If there's room, give it minimal furnishing (a `lantern`, a potted plant, a bench of `*_stairs`).
- **Rooms are enclosed and reachable.** Every interior space a player is meant to use needs a way
  in (a door or opening) and complete walls/floor/ceiling around it — no one-block holes leaking to
  the outside, no sealed rooms with no entrance. This applies to **basements and lower floors**: a
  cellar must have an actual way down into it (a staircase or ladder through a hole in the floor
  above), not be a sealed box buried under the build. If you can't trace a walkable route from the
  entrance to a room, either connect it or don't build it.
- **Interior partition walls join flush to the shell — no gap at the seam.** A wall that divides two
  rooms must meet the outer walls, floor, and ceiling **solidly along its whole edge**, leaving only
  the intended doorway. A partition that stops a block short of the outer wall (or the ceiling)
  leaves a vertical air gap you can see/walk through — the division reads as broken. Run the
  partition all the way into the structure it abuts and fill the seam.

> Quick mental test for any block: *"If a player loaded this build in a fresh world, would this
> block still be here, attached to something, and serve its purpose?"* If no, fix it.

## Walls & facades — kill the flat plane

> This section is the *principles*. For the **block-by-block construction recipes** of the facade
> moves below — timber framing panels, exposed rafters, dormers, balconies, porches, towers,
> chimney pots, window mullions — plus **exterior style archetypes** and **mansion massing &
> formal grounds**, see [`12-exterior-and-facade-detailing.md`](12-exterior-and-facade-detailing.md).

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
- **Ridge:** cap the peak with a **solid** top course — a continuous row of full blocks, or two
  opposed `*_stairs` meeting to close the peak — run continuously (a broken ridge is an obvious
  hole). Avoid a lone `*_slab type:top` ridge: floating thin above the gap between the slopes, it
  looks unfinished; the topmost course of a roof should read as a solid block.
- **The roof surface is solid — you can't see through it.** Each sloped course must be a *continuous*
  line of stairs/slabs with **no gaps between steps** that open straight into the attic/sky; if
  stepping stairs leave a notch, back it with a slab or full block so the slope reads as a closed
  surface. A roof you can see the sky through is unfinished, not "vented."
- **Fill the gable ends.** The triangular wall under each end of a gable roof must be **filled in
  solid** (matching wall or roof material) up to the ridge — a roof left open at the gable is a hole.
  If you want light or interest there, put a **window, vent, or small dormer** in the filled gable,
  not a ragged opening.
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
- **Centre the row — equal end margins.** A row of windows must sit symmetric on its face: the
  wall left of the first window equals the wall right of the last. Compute it, don't eyeball it.
  For a face of width `W` with `n` windows of width `w` and `n-1` equal gaps `g`, the leftover
  `W − n·w − (n−1)·g` must split into two **equal** end margins — so it has to be even. If it isn't,
  change `n`, `w`, or `g` (or add/drop a window) until the ends match; never let one end be 2 blocks
  and the other 3. Tip: **odd window counts centre more easily** — put one window dead-centre on the
  bay's middle column and mirror the rest outward. A wall of `2, win, 3, win, 3, win, 3` (margins
  2 vs 3) is the classic mistake; `2, win, 2, win, 2, win, 2` or a centred odd layout reads as built.
- Use `glass_pane`/`iron_bars` for a paned/leaded look, full `glass` for big modern openings,
  `*_stained_glass` as an accent (chapel, feature wall).

## Rooms & interior layout (the design level; recipes in [`06`](06-decoration-and-interiors.md))

- **Believable height:** cottages ~3 air; halls/grand rooms 4–6; don't make rooms taller than
  they are wide unless it's a tower.
- **Zone by function** and give each room a clear purpose; connect them with doorways/halls, and
  always leave **circulation** — 1–2 blocks of walking space; never fill the floor.
- **One anchor per room** (bed / dining table / counter run / fireplace) placed against a sensible
  wall first, then supporting props around it.
- **Light every room** — a dark interior reads as unfinished. A *visible* source roughly every ~6
  blocks, plus one feature light (lantern, candle, glowstone, sea lantern, redstone torch…). Never
  use `minecraft:light` ([`03`](03-blocks-and-blockstates.md)) — it's invisible, command-only, and
  often fails to light a placed structure.
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
- ❌ Ridge capped with a lone thin top-slab → ✅ solid peak: a full-block top course or opposed
  stairs meeting.
- ❌ Oversized/lollipop chimney (thin stalk, fat cap) → ✅ modest constant-width 1×1 column off the
  roof/wall, ~1–3 blocks above the ridge.
- ❌ Door is a bare hole → ✅ framed/recessed entrance with steps and lights.
- ❌ Air gap beside a door → ✅ wall sealed flush to both jambs so the door actually blocks the way.
- ❌ Perfect symmetric cube → ✅ rectangular/L-shaped footprint, wing/bay/tower, distinct front.
- ❌ Build sits on flat grass → ✅ foundation course, path, planting, terrain tie-in.
- ❌ Random/misaligned/off-centre windows → ✅ regular rhythm, vertically aligned, centred with
  equal end margins, framed/inset.
- ❌ Dark or empty/cluttered rooms → ✅ lit, zoned, anchor + supporting props, no bare floors.
- ❌ Floating block / freestanding ladder / lantern "holding up" a pillar → ✅ everything supported,
  ladders flush to a wall, lights hung from above or set on a block.
- ❌ Stairs into a ceiling or to nowhere / a pile of loose stairs floating in a room → ✅ every
  stair/ladder is a supported run that connects two reachable floors.
- ❌ "Staircase" of stacked full blocks, no headroom, or an oversized drop-hole beside it → ✅ real
  `*_stairs`, 2-block headroom, hole sized to the run so you walk down rather than fall.
- ❌ Roof slope you can see sky through, or an open triangular gable end → ✅ continuous solid slope;
  gable filled, with a window/dormer if you want an opening.
- ❌ Wall-face torch floating off the wall / floor `torch` against a wall → ✅ `wall_torch[facing]`
  leaning on a backing block.
- ❌ Hanging lantern with air above it, or a `chain` that doesn't reach the ceiling (floats), or a
  long chain trailed to the floor → ✅ a suspended `lantern[hanging=true]` hangs from a `chain` that
  runs **continuously from the ceiling/beam down to the lantern** (no gap above the chain), kept
  short; otherwise set a floor `lantern` on a solid block. A lantern with nothing under it and
  nothing solidly above it breaks on spawn.
- ❌ Candle stacked on another candle (floating) → ✅ candle on a full solid block; raise the
  `candles` count for more.
- ❌ Lantern embedded mid-pillar → ✅ lights against wall faces, on the floor, or hung from above.
- ❌ Partition wall stopping short of the shell, leaving a gap → ✅ partitions join the outer
  walls/floor/ceiling flush, only the doorway open.
- ❌ Bare, primitively-decorated basement → ✅ cellars are full rooms — storage, racks, lighting,
  and theme like any other room.
- ❌ Cauldron/furnace/pot stuck to a ceiling or wall → ✅ floor fixtures rest the right way up on a
  solid block; hang things with `chain`+`lantern` or hanging signs instead.
- ❌ Chest/barrel/furnace floating over a stairwell or facing **into** the wall (back to the room) →
  ✅ on a solid block, front faced at the open room, back to the wall.
- ❌ Decoration op carved a hole in a wall/floor (a chest-shaped gap, a missing floor tile) → ✅ decor
  placed into empty cells; never overwriting a structural block.
- ❌ A chest front / stair landing / doorway buried behind decoration → ✅ accesses kept clear and
  reachable.
- ❌ Carpet/candle/pressure plate floating over air → ✅ laid directly on a solid block (they break
  on spawn otherwise).
- ❌ Table with a full-block/double-slab top, a `slab type:top` floating over a fence, or a leg
  hovering over air → ✅ thin top on a leg that reaches the floor; on a **fence** use `carpet`/
  `pressure_plate` (flush), never a `slab type:top` (it floats above the post).
- ❌ Staircase with a floating, open underside → ✅ fill under each step with a full block or
  mirrored `half:top` stair.
- ❌ Stair run with an extra step/full block above the top, or stopping a block short of the floor →
  ✅ bottom step at floor level, top step flush with the upper floor — step straight off, no stub/lip.
- ❌ Door/balcony/raised threshold with no way to reach it (opens onto a drop) → ✅ a stair, ladder,
  stoop, or steps so the player enters and exits fluidly, never jumping or falling.
- ❌ Bed stranded mid-floor or at an odd angle → ✅ head against a wall, foot to the room.
- ❌ Cobweb used as a staircase/ladder/path → ✅ real stairs or a wall-backed ladder; cobweb only as
  a stray corner strand for an abandoned mood.
- ❌ Lantern/prop blocking a corridor, doorway, or stair → ✅ walking lane kept clear; props against
  walls or hung from above.
- ❌ Sealed basement with no way in → ✅ a real staircase/ladder down into every lower room.
