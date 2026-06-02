# 01 — The structure `.nbt` format (1.21.1)

A Minecraft structure file is a **gzip-compressed NBT** document. NBT is a typed,
hierarchical binary format (compounds = maps, lists = arrays, plus scalar types with
explicit widths). This file describes the exact tag tree Blockwright reads
(`src/main/structure/load-structure.ts` uses `prismarine-nbt`), and the JSON authoring
schema the agent should emit.

## NBT scalar types you must distinguish

NBT is typed; JSON is not. The compiler infers types from the schema below, but you must
understand the distinctions because they change how Minecraft reads the file:

| NBT type | Notation | Used in structures for |
|----------|----------|------------------------|
| Byte | `1b` | booleans (`0`/`1`), `Slot`, `Count` in some contexts |
| Int | `1` | `DataVersion`, `size` entries, `pos` entries, `state` index, item `count` (1.20.5+) |
| Double | `1.0d` | entity `pos` entries |
| String | `"x"` | block IDs, all blockstate property values, text |
| List | `[...]` | `size`, `pos`, `palette`, `blocks`, `entities`, `Items` |
| Compound | `{...}` | every object |

## Top-level tag tree

```
(root compound)
├─ DataVersion : Int            // 3955 for 1.21.1 — REQUIRED, version-gates the whole file
├─ size        : List<Int>[3]   // [sx, sy, sz] bounding box, in blocks
├─ palette     : List<Compound> // the distinct block states used (see below)
│   └─ (each) { Name: String, Properties?: Compound<String,String> }
├─ blocks      : List<Compound> // every placed block
│   └─ (each) { state: Int, pos: List<Int>[3], nbt?: Compound }
└─ entities    : List<Compound> // mobs/item frames/etc. — usually empty for builds
    └─ (each) { pos: List<Double>[3], blockPos: List<Int>[3], nbt: Compound }
```

There is also an optional `palettes` (note the **s**) — a `List<List<Compound>>` used when a
structure ships multiple random variants. **Do not emit `palettes`**; always use the single
`palette`. Blockwright reads `palette` only.

An optional top-level `author : String` (the creator's name) may appear in older files; it's
metadata only, Blockwright ignores it, and **you should not emit it**. No other top-level tags
are part of the structure format — don't invent fields.

### `palette` entries

Each entry is one *block state* (a block + a specific set of properties). Two oak stairs
facing different directions are two different palette entries.

```jsonc
{ "Name": "minecraft:oak_stairs",
  "Properties": { "facing": "east", "half": "bottom", "shape": "straight", "waterlogged": "false" } }
```

- `Name` — namespaced block ID. Required.
- `Properties` — optional compound; **omit it entirely for blocks with no variant**
  (e.g. `minecraft:oak_planks`). Every value is a **String**, even `"true"`/`"8"`.
- Missing properties default to the block's vanilla defaults, but **prefer listing the
  properties you care about** so the render is unambiguous.

### `blocks` entries

```jsonc
{ "state": 3, "pos": [2, 0, 5] }          // a block, no block-entity data
{ "state": 7, "pos": [1, 1, 0], "nbt": { /* block entity, see 04 */ } }
```

- `state` — **0-based index into `palette`**.
- `pos` — `[x, y, z]` ints, relative to the structure origin (see [`02`](02-coordinates-and-layout.md)).
- `nbt` — only for *block entities* (chests, signs, furnaces, jigsaws…). Carries that
  block's contents/state. See [`04-block-entities.md`](04-block-entities.md).

## JSON authoring schema (what the agent emits)

Emit a single JSON object. This is intentionally close to the NBT tree, with the air-omission
convenience and string-valued properties. It also accepts an optional **`ops`** array
(volumetric build operations expanded to blocks before compile) — **prefer `ops` over a large
`blocks` list**; see [`00-volumetric-ops.md`](00-volumetric-ops.md).

```jsonc
{
  "DataVersion": 3955,
  "size": [5, 4, 5],
  "palette": [
    { "Name": "minecraft:air" },
    { "Name": "minecraft:oak_planks" },
    { "Name": "minecraft:oak_log", "Properties": { "axis": "y" } }
  ],
  "blocks": [
    { "state": 1, "pos": [0, 0, 0] },
    { "state": 2, "pos": [0, 1, 0] }
    // air positions omitted
  ],
  "entities": []
}
```

Compiler contract (for whoever builds the JSON→NBT step):

- Wrap the whole thing in a gzip'd NBT root compound.
- `DataVersion`, every `size`/`pos`/`state` element, and item `count` → **Int**.
- `Properties` values → **String** (coerce numbers/bools to their string form).
- `entities[].pos` → **Double**; `entities[].blockPos` → **Int**.
- Inside block-entity `nbt`, follow the per-block-entity type notes in [`04`](04-block-entities.md)
  (e.g. `Slot` is a Byte, item `count` is an Int in 1.21.1).
- Omit `Properties` when absent; omit `nbt` when absent; never emit `palettes`.

## Minimal valid example

A 1×1×1 structure containing one stone block:

```jsonc
{
  "DataVersion": 3955,
  "size": [1, 1, 1],
  "palette": [{ "Name": "minecraft:stone" }],
  "blocks": [{ "state": 0, "pos": [0, 0, 0] }],
  "entities": []
}
```

## Sanity checks before handing off

- `DataVersion` is exactly `3955`.
- Every `blocks[].state` is `>= 0` and `< palette.length`.
- Every `pos` is within `[0,0,0]..[size-1]` on each axis.
- No duplicate `pos` (two blocks at the same cell — the later wins, but it's a bug signal).
- Property values are strings; no stray numbers/booleans in `Properties`.
- Block IDs are spelled exactly as in 1.21.1 (see [`03`](03-blocks-and-blockstates.md)).
