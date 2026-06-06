# Decoration module — Haunted

> Module guide for the **haunted** decoration. It loads into the system prompt only when
> the haunted decoration is selected. A decoration is the *look* layered over any structure
> type (house, tower): it sets the material palette, the decay/weathering, and the interior
> mood. Select it on a `template` op with `params.decoration: 'haunted'`, or build with this
> palette by hand. This is the deliberate **opposite of [`cozy`](cozy.md)**: where cozy is
> intact and warm, haunted is **ruined, dark, and uncanny**.

## The haunted palette (what the decoration maps roles to)

| Role | Block | Notes |
|------|-------|-------|
| wall / floor / ceiling | `dark_oak_planks` | gloomy timber, creaking and lightless |
| foundation | `cobblestone` → weathers to `mossy_cobblestone` | damp, neglected footing |
| corner / beam / pillar | `dark_oak_log` | heavy black frame |
| accent | `stripped_dark_oak_log` | exposed, splintered framing |
| trim | `dark_oak_slab` | warped sills, eaves |
| roof | `dark_oak_stairs` | steep, sagging |
| window | `gray_stained_glass_pane` · glass `gray_stained_glass` | grimy, **never clear** |
| door | `dark_oak_door` | |
| fence | `dark_oak_fence` | rotting rails |
| light | `soul_lantern` | **cold blue flame** — the signature of the look |

**Weathering** (`palette.weather`): `cobblestone`→`mossy_cobblestone`, `stone_bricks`→
`cracked_stone_bricks`, `deepslate_bricks`→`cracked_deepslate_bricks`,
`deepslate_tiles`→`cracked_deepslate_tiles`, `polished_blackstone_bricks`→cracked,
`nether_bricks`→`cracked_nether_bricks`. Decay defaults to **0.4** (the structure type's
decay pass punches holes + weathers; an explicit op `decay` still wins).

Stay in this dark family. If you add materials, reach for `spruce`/`stripped_dark_oak`,
`deepslate`/`blackstone` stone, `bone_block`, `soul_sand`/`soul_soil`, grimy stained glass,
`nether_bricks`. **Never** warm honey woods, bright lanterns, or clean glass — that is cozy.

## Haunted intent (apply throughout)

- **Cold, sparse, blue light.** `soul_lantern` and `soul_torch`/`soul_wall_torch` (blue
  flame) instead of warm lanterns; light **dimly and unevenly** so corners stay black. A
  `redstone_lamp` or a `candle` cluster gives a sickly low glow. Leave whole rooms nearly
  dark — dread lives in what you can't see. (Never `minecraft:light` — see [`03`](../../03-blocks-and-blockstates.md).)
- **Decay, everywhere.** Punch holes in the roof and floors (gaps to the level below),
  weather stone to mossy/cracked, hang **`cobweb`** in every ceiling corner and doorway,
  drape `vine` down the walls, scatter `brown_mushroom`/`dead_bush` in pots. A few floor
  planks replaced by `air` (a hole you could fall through) reads instantly as abandoned.
- **Broken, displaced furniture.** Use the faux-furniture grammar in
  [`11`](../../11-furniture-and-interior-detailing.md) but **wreck it**: a stair-sofa missing
  a seat, an overturned table (a single block + a leaning `trapdoor`), a toppled `chair`, a
  `barrel`/`chest` knocked on its side, a `cauldron` of murky water. Sheets over furniture =
  `white_wool`/`white_carpet` draped on a block.
- **A dead hearth.** The fireplace is **cold**: an empty `stone_brick`/`deepslate` firebox,
  ash (`gray_concrete_powder`/`campfire` with `lit:"false"`), a cracked mantel, `cobweb`
  across the opening. Optionally a single guttering `candle` on the mantel.
- **Signs of the dead.** `skeleton_skull`/`wither_skeleton_skull` on `dark_oak_fence` posts
  or set on shelves (these **render in the preview** — see [`04`](../../04-block-entities.md)),
  `bone_block` piles in a corner, a `decorated_pot` (urn) on a plinth, **black/red/white
  `candle`s** (1–4 per block) on tables, sills, and the floor. `chiseled_bookshelf` of
  forbidden tomes + a `lectern` = a study gone wrong.
- **Texture of ruin over flatness.** Mix `dark_oak_planks` with exposed `dark_oak_log`
  framing, sagging `dark_oak_slab`/`stairs` trim, broken `gray_stained_glass_pane` windows
  (replace a pane or two with `iron_bars` or `air` for a smashed look), and `mossy_cobblestone`
  wainscot — so the gloom sits on a build with depth, not a flat black box.

## Room ideas (every prop here renders in the preview — block-built, no entities)

- **Abandoned parlour:** a sheet-draped stair-sofa on a faded `*_carpet` rug (one corner
  curled up = a `carpet` gap), a cold hearth with `cobweb` across it, a toppled side table,
  `candle`s guttering on the mantel, `cobweb` in every corner, one grimy window letting in
  a shaft of blue light.
- **Derelict study/library:** `chiseled_bookshelf` walls (some books missing = a plain
  `bookshelf` gap), a `lectern` with an open tome, a `cauldron`, scattered `candle`s, a
  `skeleton_skull` watching from a shelf.
- **Rotting kitchen:** a counter run with `cobweb`, a knocked-over `barrel`, a `cauldron`
  sink of dark water, a cold `furnace`, hanging `chain` with nothing on it.
- **Ruined bedroom:** a `bed` (dark wool — beds render, see [`04`](../../04-block-entities.md))
  with the blanket torn (a `carpet` half), `cobweb` over the headboard, a cracked window, a
  single `candle` on a `barrel` nightstand.

## Haunted vs. cozy

Haunted is **ruined, dark, and cold**; cozy is intact and warm. Do the opposite of cozy at
every turn: punch decay holes, weather the stone, hang cobwebs, break the furniture, and
light with the blue flame of soul lanterns — never warm, never clean, never finished. Pair
it with the **Crypt** or **Cult temple** basement for a full descent into dread.
