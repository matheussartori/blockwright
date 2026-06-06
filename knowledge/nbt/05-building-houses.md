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

**Clearance — a door is an entrance, not a closet.** Leave **at least 3 open cells of walking
space directly in front of and behind** the door (at `y=1..2`), not a wall one block away. A door
that opens straight into a partition feels like a cupboard. Put the door where a person can
actually approach and pass through into a room or hall.

**Double doors (two leaves side by side):** give the two leaves **opposite** `hinge` values so the
hinges sit on the **outer jambs** and the handles meet in the **centre** — then opening swings each
leaf out to its own side. Same `hinge` on both is wrong: the handles end up on the outside and the
leaves swing into each other in the middle. (The compiler also corrects double-door hinges, but
author them right.)

(See door blockstate in [`03`](03-blocks-and-blockstates.md).)

## Windows

Replace selected wall cells (usually at `y=2`, the "eye level" course) with `glass_pane` or
`glass`. A nice rhythm: windows two wide, separated by one wall block. Add `oak_trapdoor`
shutters on the outside for charm, or a `oak_slab`/`stairs` sill below.

**Below grade, use `iron_bars`, not glass.** A basement / cellar window sits in the earth, so a
clear glass pane looking out into dirt reads wrong. Use `iron_bars` (a barred cellar vent) for any
opening on a wall that is below the ground floor; reserve `glass`/`glass_pane` for above-ground
storeys.

## Stairs between floors

> **Code owns the staircase now — you just say WHERE.** Whatever flight (or ladder column) you place
> between two floors, a finishing pass throws it away and rebuilds ONE clean, guaranteed-correct
> connector for that storey: a full run whose **top step always reaches the upper floor**, an opening
> cut **exactly** to the run, 2 blocks of headroom over every tread, and a landing at both ends — or, if
> a straight run can't fit, a tidy **wall ladder** instead. Two connectors can never collide. So you
> **cannot** produce the classic stair defects (a missing top step, a hole punched in the ceiling that
> nothing fills, two flights crashing into each other) — don't spend effort hand-tuning them.
> **What still matters:** put the flight in a sensible spot (a roomy interior corner, one cell off the
> outer walls, attic stairs under the ridge), one flight per storey, and keep furniture off it. If the
> pass reports it *"could not fit a clean staircase or wall ladder"* for a gap, the interior there is too
> cramped — widen it or move the stair, don't fight the geometry.

**Use the `stairs` op — never hand-place a staircase from individual `*_stairs` blocks.** Hand-placed
flights are where builds break: steps end up facing the wrong way, an upside-down `half:top` step gets
stacked on top and blocks the climb, or the last step is simply missing. The op makes all of that
impossible — it always produces a correct, climbable flight.

```json
{ "op": "stairs", "from": [4, 1, 2], "to": [4, 4, 5], "state": 7, "fill": 3, "clear": 0 }
```

- `from` = the **bottom** step (at the lower floor), `to` = the **top** step. The run is axis-aligned
  and rises **one block per cell**, so `from y=1 → to y=4` over `z=2→5` is a 4-step flight climbing
  south, landing flush with the upper floor at `y=5`. Count it: for a 3-block rise the upper floor is
  at `y+3` and the op puts steps at `y, y+1, y+2` so the top tread meets it flush — no stub, no lip.
- `state` = a `*_stairs` palette index. The op sets each step's `facing` to the ascent direction and
  keeps them all `half:bottom` (a proper flight, never an inverted blocking step).
- `fill` (optional) = a solid block index → a support block under every tread, so the run never floats
  over empty air (the old "floating steps" look).
- `clear` (optional) = your **air** index → carves 2 blocks of headroom above every step **and cuts the
  stairwell hole** through the floor/ceiling above, so the climb lands on real walkable space instead of
  into a solid ceiling. The hole is exactly the stair footprint — no oversized shaft to fall down.
- **Width:** give `from`/`to` a spread on the perpendicular axis for a wider flight (e.g. `from [3,1,2]`
  `to [5,4,5]` is a 3-wide run).
- **One flight per rise.** Don't add a second run (or a `half:top` mirror) over the same climb — it
  blocks the passage. And keep the steps clear: never park a chest, barrel, cauldron, or carpet on or
  directly above the staircase.
- **Don't run a flight into the shell — and don't glue it to a wall.** A staircase needs 2 cells of
  headroom above every tread and a clear landing at top and bottom — that space must come out of the
  *interior*, never the roof or an outer wall. **Keep every flight at least ONE empty cell off the
  outer walls** — never flush against a wall or jammed into a corner. The flight (and the cell you
  stand in to start climbing) must have open floor beside it; a stair that begins glued to the wall
  leaves no approach/standing room and forces the headroom carve to gut a structural wall. Inset the
  whole stair core by one block from the shell. Put **attic / top-floor stairs under the ridge** (the
  tall centre of a gable roof) where there's real headroom — never under a low eave, where climbing
  out punches a hole in the roof slope and leaves a suffocating, capped exit.

(For a *spiral* stair around a central post, place short `stairs` ops turning 90° at each landing, or
fall back to per-block `*_stairs` only when the op's straight run truly can't express it.)

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

- **Chimney**: **exactly ONE** on a normal house (a single flue — only a genuinely large multi-wing
  manor gets more than one). It must be **COMPLETE and CONTINUOUS**: a constant-width **1×1** column of
  `bricks`/`stone_bricks` (2×2 only on a grand build) with **NO gaps**, seated on the **hearth/firebox
  at floor level** and running unbroken **up the wall and OUT THROUGH the roof**, rising only ~1–3
  blocks past the ridge. Cap it with a `campfire` (smoke) or trapdoors **resting ON the column's top
  block** — never a campfire floating in mid-air, and never a stack that stops below the roofline (an
  incomplete chimney that doesn't pierce the roof reads as broken). Keep it **modest** — a chimney much
  wider/taller than its house, or a thin 1×1 stalk topped with an oversized 2×2 cap (a "lollipop"),
  looks wrong. Constant width, short, anchored to the build — not a tower.
  - **The flue's vertical path is RESERVED — keep it clear, top to bottom.** The whole column from the
    hearth up through every floor and out the roof is solid brick (or the firebox at the very bottom):
    **nothing else may occupy or cross it.** Never run a floor slab, a **bed**, furniture, a chest, or
    any decoration through the cells the chimney passes — and never place anything directly **above the
    hearth** in the rising path. A bed or block sitting in the middle of the chimney is a glaring bug.
    Route the flue up an exterior wall (away from beds and furniture) so its path stays empty, and
    align the floor holes so each storey's floor stops at the brick rather than cutting into it.
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
