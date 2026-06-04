# Templates (structure types × decoration themes)

A **template** op stands up a whole building shell for you. Instead of hand-authoring
every wall, floor and the roof, you emit one `template` op and the compiler turns it
into correct geometry. Templates are the cheapest way to start a believable shell —
use one as the starting massing, then layer your own `ops`/`blocks` on top to make it
specific (the visual review loop will show you what to refine).

A template names a **structure type** (the massing — `house`, `basement`) and is given
a **decoration theme** (the look — `abandoned`, `plain`). The same type composes with
any theme, so you pick the form and the mood independently.

## The `template` op

```json
{
  "op": "template",
  "name": "house",
  "from": [0, 0, 0],
  "to": [20, 12, 16],
  "params": { "theme": "abandoned", "wall": "minecraft:cobblestone", "floors": 2, "decay": 0.25 }
}
```

- `from`/`to` — the inclusive bounding box the template fills, in the same 0-indexed
  coordinates as every other op. It MUST fit inside `size`.
- `name` — the structure type: **`house`** or **`basement`**. (The old names
  `abandoned_house` and `large_basement` still work as aliases for `house`/`basement`
  with the `abandoned` theme.)
- `params` — all optional; sensible defaults apply:
  - `theme` — `abandoned` (default: weathered, with decay) or `plain` (intact, no decay).
  - **per-role block overrides** — any of `wall`, `floor`, `ceiling`, `roof`, `corner`,
    `window`, `pillar`, `light`, … set a full 1.21.1 block ID (`minecraft:spruce_planks`)
    for that role, overriding the theme. A mod namespace works when a workspace is active.
  - **shape/behaviour params** — per type (see below): `floors`, `decay`, `shape`, `seed`.

A `template` op is just a normal op: it applies **in order** with everything else, and
**later ops overwrite earlier cells**. So the usual pattern is:

1. `template` to lay the shell,
2. then your own ops to carve a different doorway, swap a façade, add a chimney,
   furnish rooms, etc.

After emitting, **review the screenshots** and refine like any other build — templates
give you a correct starting point, not a finished build.

## Structure types

### `house`
A storeyed house: foundation slab, 4-sided walls with framed corner posts, upper-storey
floors, a centred door, window bands per storey, a pitched stair roof, and (under the
`abandoned` theme) optional decay (holes + moss). Box should be at least `5×5` footprint
and `5` tall (so the roof fits); taller/wider reads better.

| param | default | meaning |
|-------|---------|---------|
| `wall` | `minecraft:cobblestone` | main wall block |
| `corner` (or `accent`) | `minecraft:spruce_log` | corner posts |
| `floor` | `minecraft:spruce_planks` | upper-storey floor slabs |
| `roof` | `minecraft:spruce_stairs` | roof block — **must be a `*_stairs`** |
| `window` | `minecraft:glass_pane` | window block |
| `floors` | `1` | number of storeys (1–4) |
| `decay` | `0.2` | 0 = pristine, 1 = heavy ruin (holes + moss). The `plain` theme forces 0. |

### `basement`
A sunken cellar: a **sealed** stone shell with a distinct floor and ceiling and a grid of
support pillars (each lit on top). Its **footprint is carved to a varied shape** (L / T /
U / plus / rect) so cellars aren't always a plain square box — leave `shape` as the
default `auto` to get a seeded plan, or pin one. Place the box **low** (small/zero `y`)
and put the above-ground build on top of it within the same `size`. The cellar has **no
built-in access on purpose** — the ceiling is solid so uneven terrain can never expose
its interior; YOU connect it to the house by carving a stairwell (a `stairs` op + an
air-index hole) down from the ground floor where they meet, placed in a back corner or
side room (never the entrance).

| param | default | meaning |
|-------|---------|---------|
| `wall` | `minecraft:cobblestone` | shell walls |
| `floor` | `minecraft:stone_bricks` | floor |
| `ceiling` | `minecraft:cobblestone` | ceiling |
| `pillar` | `minecraft:stone_bricks` | support pillars |
| `light` | `minecraft:lantern` | pillar-top light fixture |
| `decay` | `0.25` | moss weathering, 0–1. The `plain` theme forces 0. |
| `shape` | `auto` | footprint: `auto` (seeded pick of `rect`/`l`/`t`/`u`) · or pin `rect`/`l`/`t`/`u`/`plus` (`plus` only when explicit) |
| `seed` | from position | integer; change it to get a different `auto`/carved layout |

> The footprint only varies when the box is at least `5×5`; smaller boxes stay
> rectangular. Pillars and decay all follow the carved shape.

## Decoration themes

| theme | look |
|-------|------|
| `abandoned` (default) | weathered: the type's decay level applies, and stone walls pick up moss |
| `plain` | intact: decay forced to 0, no weathering — same materials, clean |

## Worked example — house over a cellar

`size` must contain both boxes. Here the cellar is `y 0..5`, the house `y 5..17`:

```json
{
  "size": [21, 18, 17],
  "palette": [{ "Name": "minecraft:air" }],
  "ops": [
    { "op": "template", "name": "basement",
      "from": [1, 0, 1], "to": [19, 5, 15],
      "params": { "theme": "abandoned", "decay": 0.3 } },
    { "op": "template", "name": "house",
      "from": [0, 5, 0], "to": [20, 17, 16],
      "params": { "theme": "abandoned", "wall": "minecraft:cobblestone", "floors": 2, "decay": 0.25 } }
  ]
}
```

`palette` only needs the air convention entry — templates intern every block they use.
Add more palette entries only for the custom ops you layer on top.
