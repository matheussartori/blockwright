# 04 — Block entities (chests, signs, furnaces…) — 1.21.1

Some blocks store extra data in a per-block `nbt` compound: containers hold items, signs
hold text, furnaces hold smelting state. In the structure file this lives on the `blocks`
entry as `nbt` (see [`01`](01-nbt-format.md)). The block's palette entry is still a normal
block with properties; the `nbt` rides alongside.

```jsonc
{ "state": 4, "pos": [1, 0, 2], "nbt": { "id": "minecraft:chest", "Items": [ /* … */ ] } }
```

- The `nbt.id` should match the block (namespaced). Blockwright tolerates it being absent
  for jigsaws, but **include it** for correctness.
- Coordinates: a block entity needs no `x/y/z` inside `nbt` for structure files — position
  comes from the `blocks` entry's `pos`.

> Rendering note: Blockwright renders chest *geometry* from the blockstate (a dedicated
> entity renderer), and does **not** render the items inside or sign text visually. So
> contents are for correctness/placement, not preview appearance. Decorate with the block
> itself; use contents when the request asks for stocked storage.

## Item format (1.21.1 — data components)

Since 1.20.5, item stacks use `id` + `count` (Int) + optional `components`. In containers
each stack also has a `Slot` (Byte). **`count` is an Int; `Slot` is a Byte.**

```jsonc
{ "Slot": 0, "id": "minecraft:bread", "count": 16 }
{ "Slot": 1, "id": "minecraft:diamond_sword", "count": 1,
  "components": { "minecraft:custom_name": "{\"text\":\"Excalibur\"}" } }
```

Old `{ id, Count, Damage, tag }` is **pre-1.20.5 and wrong for 1.21.1** — do not emit it.

## Containers

### Chest / trapped chest — `minecraft:chest`
Block props: `facing` (front), `type` (`single`/`left`/`right` for double chests),
`waterlogged`. A double chest = two adjacent blocks, one `type:left` + one `type:right`,
both same `facing`.
```jsonc
{ "state": 4, "pos": [1, 0, 1],
  "nbt": { "id": "minecraft:chest",
           "Items": [ { "Slot": 0, "id": "minecraft:apple", "count": 8 },
                      { "Slot": 13, "id": "minecraft:iron_ingot", "count": 5 } ] } }
```
Slots 0–26 (single). Empty slots are omitted.

### Barrel — `minecraft:barrel`
Props: `facing` (the open face), `open`. Same `Items` shape. 27 slots.

### Shulker box — `minecraft:*_shulker_box`
Props: `facing`. `Items`, 27 slots. 16 colors + uncolored `shulker_box`.

### Furnace / blast furnace / smoker
Props: `facing`, `lit`. NBT can hold `Items` (slot 0 input, 1 fuel, 2 output) plus
`BurnTime`/`CookTime`/`CookTimeTotal` (Short/Int). Usually leave empty unless asked.

### Dispenser / dropper / hopper
`facing` (hopper: `facing`+`enabled`). `Items` lists. Hopper has 5 slots.

## Signs & hanging signs — `minecraft:*_sign`, `*_wall_sign`, `*_hanging_sign`

1.21.1 signs are two-sided. Top-level `is_waxed` (Byte). Each side is a compound with
`messages` (a list of **4** text strings — JSON text components serialized as strings),
`color` (dye name, default `black`), and `has_glowing_text` (Byte).

```jsonc
{ "state": 6, "pos": [3, 1, 0],
  "nbt": { "id": "minecraft:oak_sign", "is_waxed": 0,
           "front_text": { "messages": ["\"Welcome\"", "\"\"", "\"\"", "\"\""],
                           "color": "black", "has_glowing_text": 0 },
           "back_text":  { "messages": ["\"\"", "\"\"", "\"\"", "\"\""],
                           "color": "black", "has_glowing_text": 0 } } }
```

- Each of the 4 `messages` entries is a **JSON text component as a string**. A plain line is
  `"\"Hello\""` (a quoted string inside the string). Empty lines are `"\"\""`.
- Block variants: standing `*_sign` (prop `rotation` 0–15), `*_wall_sign` (prop `facing`),
  `*_hanging_sign` (prop `rotation`, `attached`), `*_wall_hanging_sign` (prop `facing`).

## Lectern — `minecraft:lectern`
Props: `facing`, `has_book`, `powered`. If `has_book:true`, NBT holds a `Book` item
component. Usually leave bookless for decoration.

## Decorated pot — `minecraft:decorated_pot`
Props: `facing`, `waterlogged`. NBT `sherds` (list of 4 item IDs: back/left/right/front).

## Banners — `minecraft:*_banner` / `*_wall_banner`
Base color is in the block ID (`red_banner`). Props: standing `rotation` 0–15; wall `facing`.
Patterns live in NBT `patterns` (list of `{ color, pattern }`). Omit for a plain banner.

## Beehive / bell / brewing stand / beacon
- `bell`: props `facing`, `attachment` (`floor`/`ceiling`/`single_wall`/`double_wall`).
- `beacon`: NBT can have a beam, but for builds just place it.
- `brewing_stand`: `Items` 0–4 + `Fuel`/`BrewTime`.
- `beehive`/`bee_nest`: `facing`, `honey_level`.

## Entities (item frames, paintings, mobs) — top-level `entities`

These are **not** block entities — they go in the structure's `entities` list (see
[`01`](01-nbt-format.md)), each with `pos` (Doubles), `blockPos` (Ints), and `nbt` carrying
an `id` plus entity data.

```jsonc
{ "pos": [3.0, 1.5, 0.03], "blockPos": [3, 1, 0],
  "nbt": { "id": "minecraft:item_frame", "Facing": 2,
           "Item": { "id": "minecraft:painting", "count": 1 } } }
```
- `item_frame` / `glow_item_frame`: `Facing` Byte (0=down,1=up,2=north,3=south,4=west,5=east),
  `ItemRotation` Byte 0–7, `Item` compound.
- `painting`: `facing` Byte + `variant` (e.g. `minecraft:aztec`).
- Blockwright does not render entities in the preview; include them only when the request
  specifically needs them, and keep counts low.
