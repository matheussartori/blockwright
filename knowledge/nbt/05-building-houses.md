# 05 — Building houses (construction recipes)

This is the practical core: how to turn *"a small oak cottage"* into correct `blocks`. Work
in **layers by `y`**, build the shell, then cut openings, then add roof, then decorate
(see [`06`](06-decoration-and-interiors.md)).

## The method

1. **Choose footprint & size.** e.g. cottage interior 5×5 → exterior 7×7 (walls included),
   wall height 4 → `size: [7, 6, 7]` (floor `y=0`, walls `y=1..4`, roof `y=5`). Entrance on
   south (+Z) by default ([`02`](02-coordinates-and-layout.md)).
2. **Floor** at `y=0`: fill the whole footprint solid.
3. **Walls** at `y=1..(top-1)`: perimeter ring solid, interior air (omit interior cells).
4. **Cut openings**: door (2 tall) and windows — just *don't place* those wall cells, or
   place glass for windows.
5. **Ceiling/roof** on top.
6. **Decorate** interior + exterior.

Generate cells programmatically in your head/notes: for each `(x,y,z)` decide the block, then
emit one `blocks` entry per non-air cell, reusing palette indices.

## Materials palette (pick a cohesive set)

A build looks intentional when materials are limited and themed:

- **Oak cottage**: `oak_planks` walls, `oak_log` corner posts, `oak_stairs`/`oak_slab` roof,
  `glass_pane` windows, `oak_door`, `cobblestone` foundation, `stone_bricks` chimney.
- **Stone cottage**: `cobblestone`/`stone_bricks` walls, `oak_log` frame (Tudor look),
  `dark_oak_stairs` roof, `spruce_door`.
- **Modern**: `smooth_stone`/`white_concrete`/`glass`, flat slab roof, large `glass` walls.

Accent with **logs at corners** and **stairs/slabs at the roofline** — that single move reads
as "built by a person" rather than a box.

## Floor (`y=0`)

Fill `x ∈ 0..W-1`, `z ∈ 0..L-1` with the floor block. Optionally make the perimeter a
foundation course of `cobblestone` and the interior `oak_planks`.

## Walls (`y = 1 .. H`)

Perimeter ring only. For each wall layer, place a block where `x==0 || x==W-1 || z==0 ||
z==L-1`; leave interior cells as air (omit them).

**Tudor framing** (very effective): put `oak_log axis:y` at the four corners (and optionally
mid-span posts) for the full height, and a `oak_log axis:x`/`axis:z` belt at the top wall
course; fill the rest with `oak_planks` or `white_terracotta`.

```
Top-down wall ring (W=L=7), L=log post, #=planks, at y=2:
L # # # # # L
# . . . . . #
# . . . . . #
# . . . . . #
# . . . . . #
# . . . . . #
L # # # W # L      (door opening handled separately)
```

**Interior partition walls** (dividing rooms) must join the shell **flush**: run them from the
outer wall to the opposite wall and from floor to ceiling, leaving only the intended **doorway**.
A partition that stops a block short of the outer wall or the ceiling leaves a vertical air gap you
can see/walk through — fill the seam so the division is solid.

## Door opening (south wall, centered)

Leave the two cells `(x=mid, y=1, z=L-1)` and `(x=mid, y=2, z=L-1)` for the door. Place a
two-block `oak_door` there:
- lower half at `(mid, 1, L-1)`, upper at `(mid, 2, L-1)`, both `facing:south`, same `hinge`.

(See door blockstate in [`03`](03-blocks-and-blockstates.md).)

## Windows

Replace selected wall cells (usually at `y=2`, the "eye level" course) with `glass_pane` or
`glass`. A nice rhythm: windows two wide, separated by one wall block. Add `oak_trapdoor`
shutters on the outside for charm, or a `oak_slab`/`stairs` sill below.

## Stairs between floors

Build the steps from **actual `*_stairs` blocks**, one block up per step — *not* a zig-zag of
stacked full blocks (that reads as rubble, not a staircase). A run climbs much better when the
**underside is filled**, not left as a row of stairs floating over empty air:

- Under each `*_stairs` step, place a **full block** (matching `planks`/stone) so the run sits on
  a solid stringer — or use a second `*_stairs half:top` tucked beneath, mirroring the step, for a
  clean zig-zag underside. Either kills the ugly floating-step look.
- The run must climb **through a hole cut in the ceiling/floor above** onto real walkable space —
  never into a solid ceiling or a blank wall (see [`10`](10-design-principles.md) §Physical validity).
- **Headroom & hole size.** Leave **2 blocks of clear air above every step** so a player can walk
  the run without hitting the ceiling, and cut the ceiling/floor opening to **just the footprint of
  the stair run** — a player should *walk down the stairs*, not drop through an oversized hole beside
  them. No open shaft to fall down: the hole is the width of the stairs and the run fills it step by
  step, meeting solid floor at the bottom.
- Keep the steps clear: don't park a chest, barrel, cauldron, or carpet on or directly above the
  staircase — it blocks the passage.

## Ceiling & roofs

### Flat ceiling
Fill the top layer (`y=H+1`) solid with planks/slabs. Simple, good for modern or for a
second story floor.

### Gable roof (pitched, the classic)
Build above the walls with **stairs** stepping inward each layer, capped with a slab/stairs
ridge. For a roof over a `W`-wide building running along `z` (ridge along the z-axis):

- Layer `r=0` (just above walls): a course of stairs around the eaves, `facing` outward,
  e.g. west eave `oak_stairs facing:east half:bottom`, east eave `facing:west`.
- Each higher layer, inset by 1 on the sloped sides, stepping the stairs up.
- **Cap the ridge with a solid peak, not a lone top-slab.** Run a continuous row of **full blocks**
  along the very top, or two opposed `*_stairs half:bottom` meeting to close the peak. A bare
  `*_slab type:top` floating above the gap between the two slopes looks thin and unfinished — the
  topmost course of the roof should read as solid.

Mini cross-section (W=7, slope on x, `/`=stair facing east, `\`=stair facing west, `=`=slab):
```
y+3            =                 ridge
y+2          / =   \
y+1        /         \
y+0      /             \         eaves (sit on wall top)
x:     0  1  2   3   4  5  6
```
Translate each `/` to `oak_stairs facing:east`, each `\` to `facing:west`, and cap the ridge `=`
with a **full block** row (or two opposed stairs meeting at the peak) — not a lone `slab type:top`,
which looks thin and floating up there. Fill any gap under the slope with planks if you want a
solid (non-hollow) roof, or leave hollow for an attic.

**The roof surface and gable ends must read as solid — no see-through holes:**
- Keep each sloped course a **continuous** line of stairs with **no gaps between steps** that open
  straight to the sky/attic. If stepping stairs leave a notch, back it with a `*_slab`/full block so
  the slope is a closed surface.
- **Fill the triangular gable ends** (the wall under each end of the roof) solid up to the ridge,
  in wall or roof material. A roof open at the gable is a hole. Want light there? Put a **window or
  small dormer** in the filled gable — never leave a ragged opening.

### Hip roof
Slope inward on **all four** sides; use corner stairs (`shape: outer_*`) at the corners. More
work — only when asked for it.

## Foundations & terrain tie-in

A course of `cobblestone`/`stone_bricks` at `y=0` (or a 1-block skirt around the base) grounds
the build. For builds meant to sit on a slope, you can extend the foundation downward — but
remember structure positions can't go below `y=0`, so build the foundation *up* from `y=0` and
let the build's bottom be the foundation.

## Chimneys, porches, extensions

- **Chimney**: a **1×1** column of `bricks`/`stone_bricks` (use 2×2 only on a genuinely large/grand
  build) that **starts at the roof or a wall and runs the same width all the way up**, rising only
  ~1–3 blocks past the ridge, capped with a `campfire` (smoke) or trapdoors. Keep it **modest** — a
  chimney that's much wider/taller than its house, or a thin 1×1 stalk topped with an oversized 2×2
  cap (a "lollipop"), looks wrong. Constant width, short, anchored to the build — not a tower.
- **Porch**: extend the floor out past the entrance, add `oak_fence` posts holding a small
  slab/stair roof.
- **Bay window / wing**: bump the footprint out by 1–2 blocks on one side; keep walls/roof
  consistent.

> For the full **exterior detailing grammar** — timber framing, exposed rafters, dormers,
> balconies, porte-cochères, towers, chimney pots, window mullions, plus **style archetypes**
> (Tudor, Gothic manor, grand symmetric mansion, A-frame) and **mansion-scale massing & formal
> grounds** — see [`12-exterior-and-facade-detailing.md`](12-exterior-and-facade-detailing.md).

## Quality checklist for the shell

- Walls fully enclose (no accidental gaps except intended windows/door); interior partitions join
  the shell flush (no gap at the seam), leaving only the doorway.
- Door is 2 tall and reachable (air in front and behind at `y=1..2`); double doors meet in the
  middle (opposite `hinge`, hinges on the outer jambs).
- Stairs use real `*_stairs` with 2-block headroom and a hole sized to the run (no fall-through).
- Roof has no holes where slopes meet, no see-through gaps in the slope, gable ends filled solid;
  ridge is continuous.
- Corners use posts/contrast so it doesn't read as a plain cube.
- Interior has ≥3 air height. Then move to [`06`](06-decoration-and-interiors.md).
