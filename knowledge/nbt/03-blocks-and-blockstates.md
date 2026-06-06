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
- `facing`: the direction the stair **ascends toward** — the full-height (tall) side is on the `facing` side and the step descends to the opposite side. A staircase you walk *up* while heading east is `facing:"east"` (its tall riser is on the east). Note this differs from furnaces/chests, whose `facing` is the side that points *at the player* who placed them. Always confirm in the preview.
- `half`: `bottom` (normal) or `top` (upside-down).
- `shape`: `straight`, `inner_left`, `inner_right`, `outer_left`, `outer_right` (corners). Use `straight` unless making an L-corner.

### Slabs — `type`, `waterlogged`
All `*_slab`.
```jsonc
{ "Name": "minecraft:oak_slab", "Properties": { "type": "bottom" } }   // bottom | top | double
```
`double` = a full block (visually two slabs). A `top` slab sits in the UPPER half of its cell, so a
top slab resting on a block floats a half-block above it — use `bottom` to seat a slab on what's below
it. *(Backstop: the compiler seats a floating `top` slab — block below, air above — down to `bottom`.)*

### Doors — `facing`, `half`, `hinge`, `open`, `powered`
A door is **two blocks** stacked: the `lower` half at `y` and `upper` at `y+1`. Both palette
entries share `facing`/`hinge`/`open`; they differ in `half`. **Always emit BOTH halves** — a
lone `upper` half is a panel floating in mid-air (the "door in the middle of nowhere" defect) and
gets removed in finishing, leaving a gap. Each door also belongs in a real **doorway**: a 1-wide,
2-tall gap in a wall (solid jambs on both sides, a lintel above), not stuck to a flat wall face.
```jsonc
{ "Name": "minecraft:oak_door",
  "Properties": { "facing": "south", "half": "lower", "hinge": "left", "open": "false", "powered": "false" } }
{ "Name": "minecraft:oak_door",
  "Properties": { "facing": "south", "half": "upper", "hinge": "left", "open": "false", "powered": "false" } }
```
- `facing`: direction the door faces when **closed** (the side you approach from).
- `hinge`: `left` / `right` — which side the hinge is on.

**Double doors (two leaves side by side):** both leaves share the same `facing`; the two leaves take
**opposite `hinge` values** so the **hinges sit on the two outer jambs and the leaves meet (handles
together) in the centre**. Set the leaf on one side `hinge:left` and the other `hinge:right`. The
correct pairing depends on `facing`, so **confirm in the preview**: you should see the two handles
meeting in the middle and the hinges against the outer frame. If instead the handles are on the
outside and the seam/hinges are in the middle, **swap the two `hinge` values** (left↔right). Frame
both outer jambs with solid blocks — no air gap beside the pair.

### Trapdoors — `facing`, `half`, `open`, `waterlogged`
`oak_trapdoor`, etc. `half`: `top`/`bottom`; `open`: `true`/`false`; `facing`: hinge side.
Great for shutters, shelves, table-edge details.

### Fences, fence gates, walls — connection auto-resolves visually
`oak_fence`, `*_wall`: have `north/south/east/west` (+`up` for walls) connection booleans and
`waterlogged`. **OMIT the connection props** — the compiler derives them from neighbours at compile
time *(backstop: `connectBlocks`)*, so you don't set north/south/east/west yourself. Fence gates:
`oak_fence_gate` has `facing`, `open`, `in_wall`.

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
*(Backstop: the compiler `fixPlacement` auto-corrects the support cases below — it removes a floor
torch/candle with nothing solid under it, re-seats or removes a floating lantern, and re-anchors or
removes a wall torch with no solid backing or one facing into a wall. Still place them right: a build
that needs no fixes renders correctly the first time and costs fewer revision rounds.)*
- `torch` (on floor) vs `wall_torch` (`facing`). Same for `soul_torch`/`soul_wall_torch`,
  `redstone_torch`/`redstone_wall_torch`. **To mount a torch on a wall, use the `wall_*` variant**
  with `facing` = the direction **away from the wall** (a torch on a north wall = `facing:south`) so
  it leans on the wall and survives placement. Plain `torch`/`redstone_torch` is the **floor** form —
  it needs a solid block directly **beneath** it; placed against a wall face with air below it pops
  off on spawn. Never float a torch off a wall.
- `lantern`: `hanging` (`true`/`false`). `soul_lantern` likewise. A floor lantern sits on a solid
  block **below** it; `hanging:"true"` hangs from a solid block (or `chain`/fence) **above** it. A
  lantern is a light, **not a support** — never place one under a pillar/beam as if it holds the
  block up. For a chandelier, hang `chain` → `lantern[hanging=true]` from the ceiling.
- `glowstone`, `sea_lantern`, `shroomlight`, `froglight`s — full-block lights.
- `candle` (1–4, `candles` count + `lit`). A candle **sits on top of a full solid block** — it can't
  hang, and on air it breaks when the structure is placed. Put it on a table/slab/shelf. **Never
  stack a candle on top of another candle** (the upper one floats — a candle can't stand on a
  candle); for more flames raise the `candles` count (1–4) in the *same* block, or place separate
  candles on separate solid surfaces.

### Glass & panes
`glass`, `*_stained_glass` (16 colors), `tinted_glass`. Panes: `glass_pane`,
`*_stained_glass_pane` — OMIT the connection props; the compiler derives them *(backstop:
`connectBlocks`)*. Note glass/panes are NOT valid support for a torch or wall fixture.

### Plants & farm
`oak_sapling`, `*_sapling`; `wheat` (`age` 0–7); `carrots`/`potatoes` (`age` 0–7);
`flower_pot` + `potted_*`; flowers (`poppy`, `dandelion`, `blue_orchid`, …); `bamboo`;
`hay_block` (`axis`); `composter` (`level`); `farmland` (`moisture`).

### Wall-mounted & misc with `facing`
`ladder` (`facing`), `painting`†, `item_frame`† (entities, see [`04`](04-block-entities.md)),
`lever`, `*_button`, `*_pressure_plate`, `grindstone` (`face`,`facing`), `lectern`
(`facing`,`has_book`,`powered`), `campfire` (`facing`,`lit`).

> **`ladder` needs a solid wall behind it** (the block on the side opposite `facing`). A
> freestanding ladder in open air **breaks the moment the structure is placed in-game** — always
> run it flush against a full block, and make sure it actually climbs to a reachable floor (cut the
> ceiling hole). Same backing-block requirement for `wall_torch`/`wall_sign`/wall banners/`lever`/
> `*_button`/`painting`/`item_frame`. See [`10`](10-design-principles.md) §Physical validity.
> *(Backstop: `fixPlacement` removes a ladder/wall fixture with no solid backing, and re-anchors or
> removes a wall torch that has no backing or faces into a wall — but place them right to avoid rework.)*

### Block-entity blocks (carry `nbt`) — see [`04`](04-block-entities.md)
`chest` (`facing`,`type`), `trapped_chest`, `barrel` (`facing`,`open`), `furnace`/`blast_furnace`/`smoker`
(`facing`,`lit`), `*_sign` & `*_hanging_sign`/`*_wall_sign`, `*_shulker_box`, `brewing_stand`,
<!-- note: a chest/furnace/barrel `facing` is the side that faces the player who opens it; point it
at the open room/aisle, never into a wall. A wall-side barrel can use `facing:up` instead. -->
`beacon`, `bell`, `lectern`, `decorated_pot`, `jukebox`, `note_block`, `crafter`
(`orientation`,`triggered`,`crafting` — new in 1.21).

> Note: `flower_pot` is **not** a block entity in 1.21.1 — an empty pot is just `flower_pot`, and
> a planted pot is its own block state (`potted_poppy`, `potted_oak_sapling`, …). No `nbt`.

### Do NOT use `minecraft:light` — light with visible fixtures instead
`minecraft:light` is a **command-only, map-making technical block**: it is not obtainable in
survival, it is **invisible** (a player finds a lit room with no source, which breaks immersion),
and its light often **fails to propagate when a structure is placed** programmatically (the room
ends up dark in-game). It also **does not render in Blockwright's preview** (it shows as empty
space), so the self-review loop can't even confirm the room is lit. **Never use it to light a
build.** Always light with a *visible* source that both renders in the preview and works in
survival: `lantern`/`soul_lantern` (hung from a ceiling, or `hanging:"true"`), `sea_lantern`,
`glowstone`, `shroomlight`, `ochre_/verdant_/pearlescent_froglight`, `candle`s (1–4, `lit:"true"`),
`campfire`/`soul_campfire`, `torch`/`soul_torch`/`redstone_torch`, a lit `redstone_lamp`,
`jack_o_lantern`, `end_rod`, or `glow_lichen`. Aim for one source roughly every ~6 blocks. For a
dark/gothic theme, lean on `soul_lantern`, `candle`s, and `redstone_torch` — they light *and* set
the mood.

### 1.21 / "Tricky Trials" blocks (valid in 1.21.1)
- **Copper family:** `copper_bulb` (+`exposed_/weathered_/oxidized_/waxed_*`; props `lit`,`powered`),
  `copper_door`, `copper_trapdoor`, `copper_grate`, `chiseled_copper`. Decorative, oxidation tiers.
- **Tuff family:** `polished_tuff`, `tuff_bricks`, `chiseled_tuff(_bricks)` + their stairs/slabs/walls.
- **Trial chambers blocks:** `trial_spawner` (block entity; `trial_spawner_state`), `vault`
  (`vault_state`,`facing`,`ominous`), `heavy_core`. Use only for trial-chamber-themed builds.
- **Crafter** (auto-crafter): a block entity, see above.

### Useful structural / decorative blocks often forgotten
- `scaffolding` (`bottom`,`distance`), `chain` (`axis`), `lightning_rod` (`facing`,`powered`). A
  `chain` must connect to a **solid block (or another chain) at its top** — a chain with air above it
  floats. Use it to suspend a `lantern[hanging=true]` **a block or two below the ceiling/beam**;
  **don't run a long chain down to the floor** to hold a low lantern (set a floor lantern on a block
  instead). See [`10`](10-design-principles.md) §Physical validity.
- `iron_bars` (connection props auto-resolve like panes).
- `end_rod` (`facing`) — thin white pole/light, great for modern fixtures.
- `amethyst_cluster`/`*_amethyst_bud` (`facing`), `pointed_dripstone` (`vertical_direction`,`thickness`).
- `sea_pickle` (`pickles` 1–4, `waterlogged`), `turtle_egg`, `frogspawn` — pond/beach detail.
- Concrete & terracotta: `*_concrete`, `*_concrete_powder`, `*_terracotta`, `*_glazed_terracotta`
  (`facing` — directional pattern, useful for floors/accents).

## Common ID gotchas (1.21.1)

- It's `grass_block`, not `grass`. Plain `minecraft:grass` was renamed to `short_grass`.
- Wood "planks" are `oak_planks`; the log is `oak_log`; all-bark is `oak_wood`.
- `cobblestone_wall`, not `cobble_wall`. `stone_bricks` (plural) is the block; `stone_brick_stairs` (singular) is the stair.
- "Dark oak" is `dark_oak_*`. "Cherry" and "mangrove" and "bamboo" exist in 1.21.1.
- Copper variants exist (`cut_copper`, `*_stairs/slab`, oxidized/weathered/exposed, waxed_*) — valid in 1.21.1.

When in doubt about an exact ID, pick a simpler block you're certain exists. A wrong ID
renders as a flat fallback color in the preview — an obvious, catchable failure.
