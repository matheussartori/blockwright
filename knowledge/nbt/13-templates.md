# Templates (preset building shells)

A **template** is a parameterized building the app expands for you. Instead of
hand-authoring every wall, floor and the roof, you emit one `template` op and the
compiler turns it into correct geometry. Templates are the cheapest way to stand
up a believable shell — use one as the starting massing, then layer your own
`ops`/`blocks` on top to make it specific (and the visual review loop will show
you what to refine).

## The `template` op

```json
{
  "op": "template",
  "name": "abandoned_house",
  "from": [0, 0, 0],
  "to": [20, 12, 16],
  "params": { "wall": "minecraft:cobblestone", "floors": 2, "decay": 0.25 }
}
```

- `from`/`to` — the inclusive bounding box the template fills, in the same
  0-indexed coordinates as every other op. It MUST fit inside `size`.
- `name` — which preset (see below).
- `params` — all optional; sensible vanilla defaults apply. Block-name params take
  full 1.21.1 IDs (`minecraft:spruce_planks`) and may use a mod namespace when a
  workspace is active.

A `template` op is just a normal op: it applies **in order** with everything
else, and **later ops overwrite earlier cells**. So the usual pattern is:

1. `template` to lay the shell,
2. then your own ops to carve a different doorway, swap a façade, add a chimney,
   furnish rooms, etc.

After emitting, **review the screenshots** and refine like any other build —
templates give you a correct starting point, not a finished build.

## Available templates

### `abandoned_house`
A storeyed house: foundation slab, 4-sided walls with framed corner posts,
upper-storey floors, a centred door, window bands per storey, a pitched stair
roof, and optional decay (holes + moss). Box should be at least `5×5` footprint
and `5` tall (so the roof fits); taller/wider reads better.

| param | default | meaning |
|-------|---------|---------|
| `wall` | `minecraft:cobblestone` | main wall block |
| `corner` (or `accent`) | `minecraft:spruce_log` | corner posts |
| `floor` | `minecraft:spruce_planks` | upper-storey floor slabs |
| `roof` | `minecraft:spruce_stairs` | roof block — **must be a `*_stairs`** |
| `window` | `minecraft:glass_pane` | window block |
| `floors` | `1` | number of storeys (1–4) |
| `decay` | `0.2` | 0 = pristine, 1 = heavy ruin (holes + moss) |

### `large_basement`
A sunken cellar: a stone shell with a distinct floor and ceiling, a grid of
support pillars (each lit on top), and a ladder up through a hole in the ceiling.
Its **footprint is carved to a varied shape** (L / T / U / plus / rect) so cellars
aren't always a plain square box — leave `shape` as the default `auto` to get a
seeded plan, or pin one. Place the box **low** (small/zero `y`) and put the
above-ground build on top of it within the same `size`.

| param | default | meaning |
|-------|---------|---------|
| `wall` | `minecraft:cobblestone` | shell walls |
| `floor` | `minecraft:stone_bricks` | floor |
| `ceiling` | = `wall` | ceiling |
| `pillar` | `minecraft:stone_bricks` | support pillars |
| `light` | `minecraft:lantern` | pillar-top light fixture |
| `decay` | `0.25` | moss weathering, 0–1 |
| `shape` | `auto` | footprint: `auto` (seeded pick of `rect`/`l`/`t`/`u`) · or pin `rect`/`l`/`t`/`u`/`plus` (`plus` only when explicit) |
| `seed` | from position | integer; change it to get a different `auto`/carved layout |

> The footprint only varies when the box is at least `5×5`; smaller boxes stay
> rectangular. Pillars, the ladder and decay all follow the carved shape.

## Worked example — house over a cellar

`size` must contain both boxes. Here the cellar is `y 0..5`, the house `y 5..17`:

```json
{
  "size": [21, 18, 17],
  "palette": [{ "Name": "minecraft:air" }],
  "ops": [
    { "op": "template", "name": "large_basement",
      "from": [1, 0, 1], "to": [19, 5, 15],
      "params": { "decay": 0.3 } },
    { "op": "template", "name": "abandoned_house",
      "from": [0, 5, 0], "to": [20, 17, 16],
      "params": { "wall": "minecraft:cobblestone", "floors": 2, "decay": 0.25 } }
  ]
}
```

`palette` only needs the air convention entry — templates intern every block they
use. Add more palette entries only for the custom ops you layer on top.
