# Templates (structure types × decorations)

A **template** op stands up a whole building shell for you. Instead of hand-authoring
every wall, floor and the roof, you emit one `template` op and the compiler turns it
into correct geometry. Templates are the cheapest way to start a believable shell —
use one as the starting massing, then layer your own `ops`/`blocks` on top to make it
specific (the visual review loop will show you what to refine).

A template names a **structure type** (the massing — the silhouette and structural
detail) and is given a **decoration** (the look — the role→block palette and mood).
Any type composes with any decoration, so you pick the form and the mood
independently. Each structure type has its own deeper guide (its module guide),
loaded when you select or mention it.

> **When the user picked a structure in the composer, the shell is already seeded** —
> the build starts from that type's compiled, locked shell, and your job is to furnish
> the interior and layer detail, NOT to emit another `template`. Reach for a `template`
> op yourself only on a free-form build (no structure selected) where a stock shell is
> a good starting point.

## The `template` op

```json
{
  "op": "template",
  "name": "cottage",
  "from": [0, 0, 0],
  "to": [20, 12, 16],
  "params": { "decoration": "cozy", "wall": "minecraft:spruce_planks", "floors": 2 }
}
```

- `from`/`to` — the inclusive bounding box the template fills, in the same 0-indexed
  coordinates as every other op. It MUST fit inside `size`.
- `name` — a structure type id (below).
- `params` — all optional; sensible defaults apply:
  - `decoration` — the look (below). Each type has a natural pairing but any
    combination works. (`theme` is accepted as a legacy alias for `decoration`.)
  - **per-role block overrides** — any of `wall`, `floor`, `ceiling`, `roof`, `corner`,
    `window`, `trim`, `foundation`, `light`, … set a full 1.21.1 block ID
    (`minecraft:spruce_planks`) for that role, overriding the decoration. A mod
    namespace works when a workspace is active.
  - **shape/behaviour params** — per type (see its module guide): `floors` (storeyed
    types), `roof`/`basement`/`attic`/`surroundings` module picks, `decay`, `seed`.

A `template` op is just a normal op: it applies **in order** with everything else, and
**later ops overwrite earlier cells**. So the usual pattern is:

1. `template` to lay the shell,
2. then your own ops to furnish rooms, add a chimney, swap a façade detail, etc.

After emitting, **review the screenshots** and refine like any other build — templates
give you a correct starting point, not a finished build.

## Structure types

| id | group | massing |
|----|-------|---------|
| `cottage` | house | classic pitched, storeyed home |
| `villa` | house | stacked flat-roofed volumes, glass curtain walls, roof terrace |
| `farmhouse` | house | L-shaped plan, cross-gable, veranda |
| `raised-cottage` | house | cherry-blossom cottage raised on a stone basement, exterior entry stair |
| `manor` | house | black-and-white manor: frontispiece tower, veranda, chapel wing |
| `keep` | tower | battlemented stone keep: stacked storeys, stair core, crenellated parapet |
| `spire` | tower | derelict gothic spire: ribbed tapering shaft, skull face, spiked crown |
| `church` | church | long buttressed nave, steep gable roof, front bell tower with spire + cross |

`keep`, `spire` and `church` own their crown/roof in code — don't re-roof them.
Storeyed types take `floors`; every type is documented in its own module guide.

## Decorations

| id | look |
|----|------|
| `cozy` (default) | warm woods, lantern light, intact — no decay |
| `haunted` | abandoned, decayed, cobwebbed wood |
| `modern` | white concrete, glass, dark mullions |
| `farmhouse` | rustic timber-and-plaster |
| `sakura` | pink cherry wood + blossom |
| `gothic` | black with white detailing, slate roof |
| `castle` | universal dressed-stone / masonry |
| `chapel` | whitewashed plaster over stone, dark steep roof |
| `cursed` | dark gothic-ruin stone: blackstone, moss, soul flame |

## Worked example — a cozy cottage

```json
{
  "size": [21, 13, 17],
  "palette": [{ "Name": "minecraft:air" }],
  "ops": [
    { "op": "template", "name": "cottage",
      "from": [0, 0, 0], "to": [20, 12, 16],
      "params": { "decoration": "cozy", "floors": 2 } }
  ]
}
```

`palette` only needs the air convention entry — templates intern every block they use.
Add more palette entries only for the custom ops you layer on top.
