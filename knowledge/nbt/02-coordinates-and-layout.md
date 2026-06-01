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
- Keep the bounding box **tight** — don't pad with huge empty volumes. The preview and file
  size both suffer, and the placement footprint should match the visible build.
- **Size ceiling:** a vanilla **structure block** loads at most **48×48×48**. Larger structure
  files exist (placed via `/place` or worldgen), and Blockwright will render them, but if the
  build is meant to be reusable in-game keep each dimension ≤ 48. For bigger scenes, split into
  multiple structures (see [`08`](08-complex-structures.md) §"Modular builds").

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
