# 09 — Worked example: a complete tiny cabin (full JSON)

A single end-to-end artifact in the authoring format ([`01`](01-nbt-format.md)). It's a
**5×5×5 oak cabin**: plank floor, oak-log corner posts, plank walls, a 2-tall south door, two
side windows, a flat plank ceiling, and a furnished interior (bed, stocked chest, lantern). Use
it as a template for shape, palette discipline, multi-block alignment, and block-entity NBT.

## The plan (always sketch this first)

- `size: [5, 5, 5]` → x,z ∈ 0..4, y ∈ 0..4. Front = **south** (+Z); door on the `z=4` wall.
- **y=0** floor: solid planks (25 cells).
- **y=1..3** walls: perimeter ring; oak-log at the 4 corners (full height); door at `(2,·,4)`;
  glass-pane windows at `(0,2,2)` and `(4,2,2)`. Interior air (omitted).
- **y=4** ceiling: solid planks.
- Interior (y=1): bed foot `(1,1,1)`→head `(1,1,2)`; chest `(3,1,1)`; lantern `(3,1,3)`.
- Interior air height = y=1..3 = **3 blocks** (comfortable).

## The full structure

```jsonc
{
  "DataVersion": 3955,
  "size": [5, 5, 5],
  "palette": [
    { "Name": "minecraft:air" },                                         // 0 (omitted from blocks)
    { "Name": "minecraft:oak_planks" },                                  // 1
    { "Name": "minecraft:oak_log", "Properties": { "axis": "y" } },      // 2  corner posts
    { "Name": "minecraft:glass_pane" },                                  // 3  windows
    { "Name": "minecraft:oak_door", "Properties": {                      // 4  door lower
        "facing": "south", "half": "lower", "hinge": "left", "open": "false", "powered": "false" } },
    { "Name": "minecraft:oak_door", "Properties": {                      // 5  door upper
        "facing": "south", "half": "upper", "hinge": "left", "open": "false", "powered": "false" } },
    { "Name": "minecraft:red_bed", "Properties": {                       // 6  bed foot
        "facing": "south", "part": "foot", "occupied": "false" } },
    { "Name": "minecraft:red_bed", "Properties": {                       // 7  bed head
        "facing": "south", "part": "head", "occupied": "false" } },
    { "Name": "minecraft:chest", "Properties": {                         // 8  chest
        "facing": "west", "type": "single", "waterlogged": "false" } },
    { "Name": "minecraft:lantern", "Properties": {                       // 9  light
        "hanging": "false", "waterlogged": "false" } }
  ],
  "blocks": [
    // ── y=0: floor (all planks) ─────────────────────────────────────────
    { "state": 1, "pos": [0,0,0] }, { "state": 1, "pos": [1,0,0] }, { "state": 1, "pos": [2,0,0] }, { "state": 1, "pos": [3,0,0] }, { "state": 1, "pos": [4,0,0] },
    { "state": 1, "pos": [0,0,1] }, { "state": 1, "pos": [1,0,1] }, { "state": 1, "pos": [2,0,1] }, { "state": 1, "pos": [3,0,1] }, { "state": 1, "pos": [4,0,1] },
    { "state": 1, "pos": [0,0,2] }, { "state": 1, "pos": [1,0,2] }, { "state": 1, "pos": [2,0,2] }, { "state": 1, "pos": [3,0,2] }, { "state": 1, "pos": [4,0,2] },
    { "state": 1, "pos": [0,0,3] }, { "state": 1, "pos": [1,0,3] }, { "state": 1, "pos": [2,0,3] }, { "state": 1, "pos": [3,0,3] }, { "state": 1, "pos": [4,0,3] },
    { "state": 1, "pos": [0,0,4] }, { "state": 1, "pos": [1,0,4] }, { "state": 1, "pos": [2,0,4] }, { "state": 1, "pos": [3,0,4] }, { "state": 1, "pos": [4,0,4] },

    // ── y=1: wall ring (corners=log, door lower at x=2,z=4) ──────────────
    { "state": 2, "pos": [0,1,0] }, { "state": 1, "pos": [1,1,0] }, { "state": 1, "pos": [2,1,0] }, { "state": 1, "pos": [3,1,0] }, { "state": 2, "pos": [4,1,0] },
    { "state": 1, "pos": [0,1,1] },                                                                                                  { "state": 1, "pos": [4,1,1] },
    { "state": 1, "pos": [0,1,2] },                                                                                                  { "state": 1, "pos": [4,1,2] },
    { "state": 1, "pos": [0,1,3] },                                                                                                  { "state": 1, "pos": [4,1,3] },
    { "state": 2, "pos": [0,1,4] }, { "state": 1, "pos": [1,1,4] }, { "state": 4, "pos": [2,1,4] }, { "state": 1, "pos": [3,1,4] }, { "state": 2, "pos": [4,1,4] },

    // ── y=2: wall ring (door upper at x=2,z=4; windows at x=0/4, z=2) ────
    { "state": 2, "pos": [0,2,0] }, { "state": 1, "pos": [1,2,0] }, { "state": 1, "pos": [2,2,0] }, { "state": 1, "pos": [3,2,0] }, { "state": 2, "pos": [4,2,0] },
    { "state": 1, "pos": [0,2,1] },                                                                                                  { "state": 1, "pos": [4,2,1] },
    { "state": 3, "pos": [0,2,2] },                                                                                                  { "state": 3, "pos": [4,2,2] },
    { "state": 1, "pos": [0,2,3] },                                                                                                  { "state": 1, "pos": [4,2,3] },
    { "state": 2, "pos": [0,2,4] }, { "state": 1, "pos": [1,2,4] }, { "state": 5, "pos": [2,2,4] }, { "state": 1, "pos": [3,2,4] }, { "state": 2, "pos": [4,2,4] },

    // ── y=3: wall ring (plank lintel above the door) ────────────────────
    { "state": 2, "pos": [0,3,0] }, { "state": 1, "pos": [1,3,0] }, { "state": 1, "pos": [2,3,0] }, { "state": 1, "pos": [3,3,0] }, { "state": 2, "pos": [4,3,0] },
    { "state": 1, "pos": [0,3,1] },                                                                                                  { "state": 1, "pos": [4,3,1] },
    { "state": 1, "pos": [0,3,2] },                                                                                                  { "state": 1, "pos": [4,3,2] },
    { "state": 1, "pos": [0,3,3] },                                                                                                  { "state": 1, "pos": [4,3,3] },
    { "state": 2, "pos": [0,3,4] }, { "state": 1, "pos": [1,3,4] }, { "state": 1, "pos": [2,3,4] }, { "state": 1, "pos": [3,3,4] }, { "state": 2, "pos": [4,3,4] },

    // ── y=4: ceiling (all planks) ───────────────────────────────────────
    { "state": 1, "pos": [0,4,0] }, { "state": 1, "pos": [1,4,0] }, { "state": 1, "pos": [2,4,0] }, { "state": 1, "pos": [3,4,0] }, { "state": 1, "pos": [4,4,0] },
    { "state": 1, "pos": [0,4,1] }, { "state": 1, "pos": [1,4,1] }, { "state": 1, "pos": [2,4,1] }, { "state": 1, "pos": [3,4,1] }, { "state": 1, "pos": [4,4,1] },
    { "state": 1, "pos": [0,4,2] }, { "state": 1, "pos": [1,4,2] }, { "state": 1, "pos": [2,4,2] }, { "state": 1, "pos": [3,4,2] }, { "state": 1, "pos": [4,4,2] },
    { "state": 1, "pos": [0,4,3] }, { "state": 1, "pos": [1,4,3] }, { "state": 1, "pos": [2,4,3] }, { "state": 1, "pos": [3,4,3] }, { "state": 1, "pos": [4,4,3] },
    { "state": 1, "pos": [0,4,4] }, { "state": 1, "pos": [1,4,4] }, { "state": 1, "pos": [2,4,4] }, { "state": 1, "pos": [3,4,4] }, { "state": 1, "pos": [4,4,4] },

    // ── interior furniture (y=1) ────────────────────────────────────────
    { "state": 6, "pos": [1,1,1] },                       // bed foot
    { "state": 7, "pos": [1,1,2] },                       // bed head (+z of foot ⇒ facing south)
    { "state": 8, "pos": [3,1,1],                         // chest, stocked (Items invisible in preview)
      "nbt": { "id": "minecraft:chest",
               "Items": [ { "Slot": 0, "id": "minecraft:bread", "count": 16 },
                          { "Slot": 1, "id": "minecraft:oak_sapling", "count": 8 } ] } },
    { "state": 9, "pos": [3,1,3] }                        // lantern (light source)
  ],
  "entities": []
}
```

## Why each non-obvious choice

- **`air` is palette index 0 but never appears in `blocks`** — interior/empty cells are omitted
  ([`01`](01-nbt-format.md)). Only the 4 corners differ from planks in the wall ring, so most
  ring cells reuse `state 1`.
- **Door = two stacked entries** sharing `facing`/`hinge`, differing only in `half`
  ([`03`](03-blocks-and-blockstates.md)); the `y=3` cell above it is a plank lintel, not air, so
  there's no gap.
- **Bed = two entries**; head is one cell in the `facing` direction from foot, so foot `(1,1,1)` +
  head `(1,1,2)` ⇒ `facing:"south"`.
- **Chest carries `nbt`** with `Items` (note `count` is Int, `Slot` is Byte) — correct for
  placement, but **invisible in the preview** (see the fidelity table in
  [`08`](08-complex-structures.md)).
- **`size` is exactly `maxPos+1`** on each axis: max index is 4 everywhere ⇒ `[5,5,5]`.

## Run the sanity checks ([`01`](01-nbt-format.md) §"Sanity checks")

- `DataVersion` = 3955 ✓
- every `state` ∈ 0..9 (palette length 10) ✓
- every `pos` within `[0,0,0]..[4,4,4]` ✓
- no duplicate `pos` (furniture sits on interior-air cells, not on placed blocks) ✓
- all `Properties` values are strings; `count` Int, `Slot` Byte ✓

## How to grow it

- **Pitched roof:** raise `size.y`, drop the flat ceiling, and add stepped `oak_stairs` courses
  ([`05`](05-building-houses.md) §"Gable roof").
- **Second storey:** the `y=4` course becomes the upper floor; add walls `y=5..7`, a new ceiling,
  and cut a headroom hole for a stair run ([`08`](08-complex-structures.md) §"Multi-floor").
- **More furniture:** add palette entries and place on interior-air cells — never renumber
  existing indices ([`08`](08-complex-structures.md) §"Generating large builds").
