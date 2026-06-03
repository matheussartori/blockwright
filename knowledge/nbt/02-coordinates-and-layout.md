# 02 — Coordinates, size & layout

## The coordinate system

Minecraft is **right-handed Y-up**:

- **+X = east**, −X = west
- **+Y = up**, −Y = down
- **+Z = south**, −Z = north

A structure's positions are **local** to the structure, **0-indexed**, and measured from the
**most-negative corner** (the cell toward −X, −Y, −Z). So a structure with `size: [5, 4, 6]`
has valid positions:

```
x ∈ 0..4   (5 wide, west→east)
y ∈ 0..3   (4 tall, bottom→top)
z ∈ 0..5   (6 long, north→south)
```

`size` is the bounding box, **not** the max index. `size[i]` must be exactly
`maxPos[i] + 1`. If your highest block is at `pos[1] = 3`, then `size[1]` is `4`.

> Mental model: think of the build as a stack of horizontal **layers** by `y`. Layer `y=0`
> is the floor/foundation; build upward. This matches how you'll reason about a house.

## Origin and the "floor"

`pos [0,0,0]` is one corner of the floor. By convention put the **ground floor on `y=0`** so
the build sits on the world surface when placed. If a build has a foundation that should sink
into the ground, you can still keep it at `y=0` and let the placer decide depth — don't use
negative coordinates (they're invalid in a structure file).

## Facing and orientation conventions

Many blocks carry a `facing` property. Decide a **front** for the whole build and keep all
furniture/doors/stairs consistent with it. Common convention for generated builds:

- Make the **entrance face south (+Z)** by default, so the "front" of the house is the
  `z = size_z − 1` wall. State this in any notes you return so edits stay consistent.

Block `facing` values: `north`, `south`, `east`, `west` (and `up`/`down` for some blocks).
Note the directional meaning differs by block family — see [`03`](03-blocks-and-blockstates.md):

- **Furnaces / chests / droppers / observers**: `facing` = the side that points *at the player*
  who placed it (the front/opening).
- **Stairs**: `facing` = the side the stair *ascends toward* (the tall riser side) — a different
  meaning of "front"; see [`03`](03-blocks-and-blockstates.md).
- **Doors**: `facing` = the direction faced when **closed** (the side you approach from).
- **Logs / pillars**: use `axis` (`x`/`y`/`z`), not `facing`.
- **Wall torches / ladders / wall signs / wall banners / wall buttons & levers**: `facing` = the
  direction the block **points, away from** its supporting wall (a `wall_torch[facing=east]` is
  mounted on a block to its west and sticks out east).

## Rotation (when reusing/mirroring patterns)

Minecraft structures are placed with one of four Y rotations (`NONE`, `CW_90`, `CW_180`,
`CW_270`) and optional mirroring. If you rotate a layout in your head, you must also rotate
every `facing`/`axis`:

- Quarter turn **clockwise** (looking down from above): `north→east→south→west→north`.
- Coordinates for a CW_90 turn of a `W×L` footprint (`W` along x, `L` along z) map
  `(x, z) → (L−1−z, x)`, and the new footprint is `L×W`. (This matches Minecraft's own
  `CLOCKWISE_90`, raw transform `(x,z)→(−z,x)` then shifted to stay non-negative.) The inverse
  CW_270 is `(x, z) → (z, W−1−x)`; CW_180 is `(x, z) → (W−1−x, L−1−z)`.

Keep rotations simple: design the build in one orientation; let the app/world handle final
placement rotation. Only rotate manually when mirroring a wing or repeating a module — and when
you do, **re-derive the corners by hand and verify in the preview**, since a sign error here
silently flips the whole module.

## Sizing guidance for generated builds

Pick a size that fits the request, then build inside it. Rules of thumb:

- **Interior height**: 3 blocks of air minimum for a comfortable room (floor at `y=0`, air at
  `y=1..3`, ceiling at `y=4`). 4–5 for a "grand" room.
- **Small house**: ~`7×6×7` (incl. walls). **Cottage**: ~`9×7×9`. **Two-story**: add ~5 to `y`.
- **Wall thickness**: 1 block. **Floor/ceiling**: 1 block.
- Keep the bounding box **snug around the geometry** — don't pad with huge *empty* volumes (a
  tight box renders faster). But "snug" means *no wasted air*, **not** "small": make `size` exactly
  as big as the build needs. A request for a big build means a big `size` — never shrink the design
  to hit some number.
- **There is no width/depth limit.** `size` is **not a budget you must stay under** — it's just the
  bounding box, and you set it to whatever the build requires. If the user asks for a huge sprawling
  basement, an enormous hall, or many rooms, **make `size` large enough to hold all of it** (tens or
  hundreds of blocks per axis is fine — Blockwright renders it). Do not cram a big request into a
  small footprint, and do not refuse size for being "too big".
- **The 48×48×48 thing is a soft in-game note, not a cap.** A vanilla *structure block* only loads
  48³ at once, but larger `.nbt`s exist (placed via `/place`/worldgen) and Blockwright renders them
  fully. Only keep each dimension ≤ 48 if the user specifically wants a structure-block-reusable
  piece; otherwise build at whatever size looks right. For genuinely scene-scale work you can also
  split into multiple structures ([`08`](08-complex-structures.md) §"Modular builds").

## The bounding box wraps the WHOLE build — mixed footprints & expansion

`size` is the box around **everything**, summed across all parts — so different parts can have very
different footprints. **A small tower can sit on a giant basement.** If the above-ground tower is
6×6 but the user wants a 24×24 undercroft with several rooms, the build's footprint is **24×24**
(the basement), and the tower is a 6×6 column **centred over it**:

- `size` on each axis = the **extent of the largest part** on that axis (here `[24, towerHeight +
  basementHeight, 24]`).
- The wide part (basement) spans the full `0..23`; the narrow part (tower) is **offset inward** so
  it's centred: tower x-range `9..14`, z-range `9..14` (`(24−6)/2 = 9`). The two share the same
  most-negative corner `[0,0,0]`; you place each part at its own offset within the one box.
- Plan each level's footprint separately (a top-down grid per level, [`08`](08-complex-structures.md)),
  then size the box to the **union** of them. Levels are free to differ — a wide basement, a
  medium ground floor, a slim tower, a flared roof — that's normal, not a problem.

**Expanding an existing build (edits).** Growing a build is a real, expected edit — don't treat the
current `size` as fixed. To enlarge a part (e.g. "make the basement bigger" / "add more rooms"):

1. **Grow `size`** on the axes that need room (and re-derive it = `maxPos + 1` after).
2. **Re-anchor** what should stay centred. If you widen the footprint, the parts you kept (the
   tower, the entrance) usually need to shift by the same offset so they stay centred over/aligned
   with the enlarged part — recompute their positions; don't leave them stuck in a corner.
3. **Re-emit the COMPLETE structure (`mode:"full"`)** for any change that resizes or re-anchors.
   A `patch` can't *move* the cells already placed, so it can't re-centre a tower over a widened
   basement — use `full` and rebuild from the new, larger box. (Patches are for adding/fixing detail
   *within* the existing footprint.)

## Worked layout: footprint → layers

For a `7×?×7` cabin, the floor layer (`y=0`) as a top-down grid (`.`=air, `#`=plank,
`D`=door cell on the wall) — N is top (−Z), S is bottom (+Z):

```
z=0  # # # # # # #     (north wall line)
z=1  # . . . . . #
z=2  # . . . . . #
z=3  # . . . . . #
z=4  # . . . . . #
z=5  # . . . . . #
z=6  # # # D # # #     (south wall — door at x=3)
     x:0 1 2 3 4 5 6
```

Then `y=1..3` repeats the wall ring (perimeter solid, interior air), and `y=4` is the
ceiling/roof base. Translate each `#` cell to a `blocks` entry; leave `.` cells out. See
[`05-building-houses.md`](05-building-houses.md) for full recipes.
