# 03 — Blocks & blockstates (1.21.1)

A *block state* = a block ID + its property values. In the palette, each distinct
combination is one entry. **All property values are strings.** This file lists the
building-relevant blocks and the properties that matter for rendering.

> If a block has no properties you care about, omit `Properties` and accept defaults.
> But for stairs, slabs, doors, logs, etc., the properties below are what make them look
> right — set them deliberately.

## Property cheat-sheet by block family

### Full/solid blocks (no properties)
`stone`, `cobblestone`, `oak_planks` (and all wood planks), `bricks`, `stone_bricks`,
`smooth_stone`, `glass`, `white_wool` (16 colors), `terracotta`, `dirt`, `grass_block`†,
`sand`, `bookshelf`.

† `grass_block` has `snowy` (`true`/`false`); usually fine to omit.

### Logs, pillars, woods — `axis`
`oak_log`, `spruce_log`, …, `stripped_oak_log`, `oak_wood`, `bamboo_block`, `basalt`,
`quartz_pillar`, `purpur_pillar`, `chain`, `deepslate`.

```jsonc
{ "Name": "minecraft:oak_log", "Properties": { "axis": "y" } }   // y = upright, x/z = lying
```

### Stairs — `facing`, `half`, `shape`, `waterlogged`
All `*_stairs` (e.g. `oak_stairs`, `stone_brick_stairs`, `cobblestone_stairs`).

```jsonc
{ "Name": "minecraft:oak_stairs",
  "Properties": { "facing": "north", "half": "bottom", "shape": "straight", "waterlogged": "false" } }
```
- `facing`: direction the **full-height back** faces away from / the step rises toward. Practically: a stair you climb going north has `facing: "south"` is wrong — set `facing` to the direction you face when ascending. Verify in preview.
- `half`: `bottom` (normal) or `top` (upside-down).
- `shape`: `straight`, `inner_left`, `inner_right`, `outer_left`, `outer_right` (corners). Use `straight` unless making an L-corner.

### Slabs — `type`, `waterlogged`
All `*_slab`.
```jsonc
{ "Name": "minecraft:oak_slab", "Properties": { "type": "bottom" } }   // bottom | top | double
```
`double` = a full block (visually two slabs).

### Doors — `facing`, `half`, `hinge`, `open`, `powered`
A door is **two blocks** stacked: the `lower` half at `y` and `upper` at `y+1`. Both palette
entries share `facing`/`hinge`/`open`; they differ in `half`.
```jsonc
{ "Name": "minecraft:oak_door",
  "Properties": { "facing": "south", "half": "lower", "hinge": "left", "open": "false", "powered": "false" } }
{ "Name": "minecraft:oak_door",
  "Properties": { "facing": "south", "half": "upper", "hinge": "left", "open": "false", "powered": "false" } }
```
- `facing`: direction the door faces when **closed** (the side you approach from).
- `hinge`: `left` / `right` — which side the hinge is on.

### Trapdoors — `facing`, `half`, `open`, `waterlogged`
`oak_trapdoor`, etc. `half`: `top`/`bottom`; `open`: `true`/`false`; `facing`: hinge side.
Great for shutters, shelves, table-edge details.

### Fences, fence gates, walls — connection auto-resolves visually
`oak_fence`, `*_wall`: have `north/south/east/west` (+`up` for walls) connection booleans and
`waterlogged`. **You usually don't need to set the connection props** — the renderer/game
connects to neighbors. Fence gates: `oak_fence_gate` has `facing`, `open`, `in_wall`.

### Stairs/slabs/walls "material" list (1.21.1, common)
Wood: `oak spruce birch jungle acacia dark_oak mangrove cherry bamboo crimson warped`.
Stone-ish: `stone cobblestone stone_brick mossy_* smooth_stone brick mud_brick
deepslate_brick deepslate_tile polished_deepslate andesite diorite granite (polished_*)
sandstone red_sandstone prismarine quartz purpur blackstone polished_blackstone(_brick)
tuff(_brick) end_stone_brick nether_brick`.

### Beds — `facing`, `part`, `occupied`
A bed is **two blocks**: `foot` then `head` in the `facing` direction.
```jsonc
{ "Name": "minecraft:red_bed", "Properties": { "facing": "north", "part": "foot", "occupied": "false" } }
{ "Name": "minecraft:red_bed", "Properties": { "facing": "north", "part": "head", "occupied": "false" } }
```
The `head` sits one block in the `facing` direction from the `foot`. 16 colors.

### Torches & lights
- `torch` (on floor) vs `wall_torch` (`facing`). Same for `soul_torch`/`soul_wall_torch`,
  `redstone_torch`/`redstone_wall_torch`.
- `lantern`: `hanging` (`true`/`false`). `soul_lantern` likewise.
- `glowstone`, `sea_lantern`, `shroomlight`, `froglight`s — full-block lights.
- `candle` (1–4, `candles` count + `lit`).

### Glass & panes
`glass`, `*_stained_glass` (16 colors), `tinted_glass`. Panes: `glass_pane`,
`*_stained_glass_pane` — connection props auto-resolve like fences.

### Plants & farm
`oak_sapling`, `*_sapling`; `wheat` (`age` 0–7); `carrots`/`potatoes` (`age` 0–7);
`flower_pot` + `potted_*`; flowers (`poppy`, `dandelion`, `blue_orchid`, …); `bamboo`;
`hay_block` (`axis`); `composter` (`level`); `farmland` (`moisture`).

### Wall-mounted & misc with `facing`
`ladder` (`facing`), `painting`†, `item_frame`† (entities, see [`04`](04-block-entities.md)),
`lever`, `*_button`, `*_pressure_plate`, `grindstone` (`face`,`facing`), `lectern`
(`facing`,`has_book`,`powered`), `campfire` (`facing`,`lit`).

### Block-entity blocks (carry `nbt`) — see [`04`](04-block-entities.md)
`chest` (`facing`,`type`), `trapped_chest`, `barrel` (`facing`,`open`), `furnace`/`blast_furnace`/`smoker`
(`facing`,`lit`), `*_sign` & `*_hanging_sign`/`*_wall_sign`, `*_shulker_box`, `brewing_stand`,
`beacon`, `bell`, `lectern`, `decorated_pot`, `flower_pot`†, `jukebox`, `note_block`.

## Common ID gotchas (1.21.1)

- It's `grass_block`, not `grass`. Plain `minecraft:grass` was renamed to `short_grass`.
- Wood "planks" are `oak_planks`; the log is `oak_log`; all-bark is `oak_wood`.
- `cobblestone_wall`, not `cobble_wall`. `stone_bricks` (plural) is the block; `stone_brick_stairs` (singular) is the stair.
- "Dark oak" is `dark_oak_*`. "Cherry" and "mangrove" and "bamboo" exist in 1.21.1.
- Copper variants exist (`cut_copper`, `*_stairs/slab`, oxidized/weathered/exposed, waxed_*) — valid in 1.21.1.

When in doubt about an exact ID, pick a simpler block you're certain exists. A wrong ID
renders as a flat fallback color in the preview — an obvious, catchable failure.
