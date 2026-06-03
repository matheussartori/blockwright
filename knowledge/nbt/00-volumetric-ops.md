# 00 — Volumetric build ops (use these, not per-block lists)

The single biggest cost in generating a structure is **emitting blocks one at a time**.
A flat `blocks` list spends one JSON entry — and ~10 output tokens — per cell, so a
modest house is thousands of tokens and a mansion is tens of thousands (often more than a
single response can hold). **Describe geometry with `ops` instead.** One `fill` is a whole
wall; the compiler expands ops into the real block list locally, for free.

The authoring object gains an optional `ops` array, applied **before** `blocks`:

```jsonc
{
  "DataVersion": 3955,
  "size": [9, 6, 7],
  "palette": [
    { "Name": "minecraft:air" },          // index 0 — carve with this
    { "Name": "minecraft:stone_bricks" }, // 1
    { "Name": "minecraft:oak_planks" },   // 2
    { "Name": "minecraft:glass_pane" }    // 3
  ],
  "ops": [
    { "op": "fill",   "from": [0,0,0], "to": [8,0,6], "state": 1 },   // floor
    { "op": "walls",  "from": [0,1,0], "to": [8,4,6], "state": 1 },   // 4 outer walls
    { "op": "fill",   "from": [0,5,0], "to": [8,5,6], "state": 2 },   // ceiling
    { "op": "fill",   "from": [4,1,0], "to": [4,3,0], "state": 0 },   // carve a doorway (air)
    { "op": "fill",   "from": [2,2,0], "to": [2,3,0], "state": 3 },   // a window
    { "op": "line",   "from": [0,6,3], "to": [8,6,3], "state": 2 }    // a ridge beam
  ],
  "blocks": [
    { "state": 1, "pos": [4,1,3], "nbt": { /* a chest, see 04 */ } }  // detail / block entities
  ],
  "entities": []
}
```

## The ops

| `op` | Fields | Fills |
|------|--------|-------|
| `fill`   | `from`, `to`, `state` | every cell in the box `from`..`to` (inclusive, any corner order) |
| `hollow` | `from`, `to`, `state` | the **6-face shell** of that box (interior left untouched) |
| `walls`  | `from`, `to`, `state` | the **4 vertical sides** only — no floor, no ceiling |
| `line`   | `from`, `to`, `state` | an integer 3D line between the two endpoints (beams, edges, diagonals) |
| `block`  | `pos`, `state`, `nbt?` | one cell; the only op that may carry block-entity `nbt` |

### Transform & roof ops (huge for symmetric / pitched builds)

These act on cells **already placed by earlier ops** (order matters) and, for mirror/rotate,
**rewrite orientation blockstates as they copy** — so stairs, doors, logs and furnaces point the
right way in the copy automatically. This is the cure for the #1 manual-symmetry bug.

| `op` | Fields | Does |
|------|--------|------|
| `mirror` | `from`, `to`, `axis:"x"\|"z"` | Reflects the region onto itself across its centre plane. Build **half** a symmetric facade/wing, then mirror it. Flips `facing` (E↔W or N↔S), stair `shape` (left↔right) and door `hinge`. |
| `rotate` | `from`, `to`, `turns:1\|2\|3`, `pivot?:[x,z]` | Turns the region `turns` clockwise quarter-turns about `pivot` (default region centre). Build **one arm** of a cross / one corner tower, rotate it 2–4×. Rotates `facing` and swaps `axis` (x↔z) on odd turns. |
| `repeat` | `from`, `to`, `axis`, `step`, `count` | Tiles the region `count` times, each offset `step` along `axis` (negative allowed). Window bays, columns, balusters, fence runs. Pure translation (no blockstate change). |
| `roof` | `from`, `to`, `state` (`*_stairs`), `style?`, `ridge?`, `fill?` | Lays a pitched stair roof over the eave rectangle, deriving the per-side stair `facing` (and corner `shape` for `"hip"`). `ridge` = the axis the ridge runs along (gable; default the longer side). `fill` plugs the gap under each step for a solid roof / attic floor. Roofs are where builds break — use this instead of hand-placing stairs. |

So a symmetric manor is: build the left half with fill/hollow ops → one `mirror` for the right
half → one `roof`. A 4-fold cross plan: build one wing → `rotate` ×3. This is both far fewer
output tokens **and** guaranteed-correct orientation.

## Rules

- **`state` is a palette index**, exactly like `blocks` (so add an air entry — index 0 by
  convention — to carve).
- **Order matters: later ops overwrite earlier cells.** Work coarse → fine: lay the shell,
  then carve doors/windows by filling an air index, then add detail. Then the `blocks`
  overlay runs last, on top of all ops.
- **Keep interiors empty — this is the most common mistake.** Any volume meant to be entered
  or lived in (a room, a house body, a tower shaft) must be a **shell**: one `hollow`, or
  `walls` + a floor `fill` + a ceiling `fill`. **Never `fill` a 3D box that has an interior** —
  a solid `fill` packs every interior cell with the block, burying the inside in stone so the
  player can't go in. Reserve solid `fill` for things that are actually solid: a floor/ceiling
  slab (height 1), a foundation, a pillar, a 1-thick wall. Rule of thumb: if all three of
  `to - from` are ≥ 2, you almost certainly want `hollow`, not `fill`.
- Every `from`/`to`/`pos` must be within `[0,0,0]..[size-1]`, integers (same bounds rule as
  `blocks`).
- Air cells (`minecraft:air`/`cave_air`/`void_air`) are **dropped from the output**, so
  carving with an air index is the intended way to subtract — you don't need to avoid
  overlap, just order your ops.
- You may still use `blocks` alone for a tiny build, but for anything room-sized or bigger,
  **ops are mandatory for acceptable speed**. Don't expand a box into hundreds of `blocks`.
- **`mirror`/`rotate`/`repeat` take no `state`** — they copy existing cells. Place the source
  geometry first, then transform it. (`roof`'s `state` must be a `*_stairs` block.)
- **Don't air-fill outside your build.** The compiler clears each occupied column's interior
  with air automatically and **leaves everything outside your footprint as world terrain**, so a
  non-rectangular footprint (cross, L, wings) places cleanly without gouging a rectangular hole.
  Only place `air` where you actively want a cell *emptied*; never paint air across the exterior.
- **Block IDs are validated** against the real 1.21.1 block set before render — a typo or wrong
  variant (`*_planks` vs `*_wood`, `_stained_glass` vs `_stained_glass_pane`) is rejected with the
  bad ID, so use exact IDs.

See [`01-nbt-format.md`](01-nbt-format.md) for the full tag tree and [`05`](05-building-houses.md)/
[`08`](08-complex-structures.md) for what to build; express all of it through ops.
