# Templates (structure types × decorations)

A **template** op stands up a whole building shell for you. Instead of hand-authoring
every wall, floor and the roof, you emit one `template` op and the compiler turns it
into correct geometry. Templates are the cheapest way to start a believable shell —
use one as the starting massing, then layer your own `ops`/`blocks` on top to make it
specific (the visual review loop will show you what to refine).

A template names a **structure type** (the massing — currently `tower`) and is given a
**decoration** (the look — `cozy`). The same type composes with any decoration, so you
pick the form and the mood independently. Each structure type has its own deeper guide
(the module guide for `tower`), loaded when you select or mention it.

> **Houses do NOT have a template — build them yourself.** There is no `house` preset:
> when the user wants a house/cottage/cabin, design and lay its massing, roof, floors,
> stairs, doors and windows with your own ops (see `05-building-houses.md` and the house
> module guide). Never emit `{ op: 'template', name: 'house' }` — it is not a structure
> type, and a stamped house shell is exactly what we do NOT want.

## The `template` op

```json
{
  "op": "template",
  "name": "classic",
  "from": [0, 0, 0],
  "to": [20, 12, 16],
  "params": { "decoration": "cozy", "wall": "minecraft:spruce_planks", "floors": 2 }
}
```

- `from`/`to` — the inclusive bounding box the template fills, in the same 0-indexed
  coordinates as every other op. It MUST fit inside `size`.
- `name` — the structure type: **`tower`** (houses have no template — build them by hand).
- `params` — all optional; sensible defaults apply:
  - `decoration` — the look. Currently **`cozy`** (the default): warm woods, lantern
    light, intact (no decay). (`theme` is accepted as a legacy alias for `decoration`.)
  - **per-role block overrides** — any of `wall`, `floor`, `ceiling`, `roof`, `corner`,
    `window`, `trim`, `foundation`, `light`, … set a full 1.21.1 block ID
    (`minecraft:spruce_planks`) for that role, overriding the decoration. A mod namespace
    works when a workspace is active.
  - **shape/behaviour params** — per type (see below): `floors`, `crown`, `decay`, `seed`.

A `template` op is just a normal op: it applies **in order** with everything else, and
**later ops overwrite earlier cells**. So the usual pattern is:

1. `template` to lay the shell,
2. then your own ops to carve a different doorway, swap a façade, add a chimney,
   furnish rooms, etc.

After emitting, **review the screenshots** and refine like any other build — templates
give you a correct starting point, not a finished build.

## Structure types

### `tower`
A tall, vertically-emphasised tower built as **base → shaft → crown**: a wider battered
base, an inset shaft with corner quoins, per-storey string-course rings and window slits,
bracket lanterns, and a crown. Use a small square-ish footprint (≈`5×5`–`9×9`) and make
it tall (`H ≥ 9` for a real crown). See the tower module guide for the full playbook.

| param | default | meaning |
|-------|---------|---------|
| `wall` | (decoration) | shaft walls |
| `foundation` | (decoration) | battered base |
| `corner` | (decoration) | corner quoin posts |
| `trim` | (decoration) | string-course rings + cap |
| `roof` | (decoration) | spire block (`*_stairs`) when `crown: spire` |
| `crown` | `parapet` | `parapet` (machicolations + battlements) · `spire` (pitched) · `flat` |
| `decay` | `0` (cozy) | ruin level, 0–1. Cozy keeps this at 0. |

## Decorations

| decoration | look |
|------------|------|
| `cozy` (default) | warm woods, lantern light, intact — no decay, no weathering |

(More decorations are planned. If the user wants a ruined/abandoned look, say it isn't
available yet rather than half-applying decay to cozy.)

## Worked example — a cozy tower

```json
{
  "size": [9, 18, 9],
  "palette": [{ "Name": "minecraft:air" }],
  "ops": [
    { "op": "template", "name": "tower",
      "from": [0, 0, 0], "to": [8, 17, 8],
      "params": { "decoration": "cozy", "crown": "parapet" } }
  ]
}
```

`palette` only needs the air convention entry — templates intern every block they use.
Add more palette entries only for the custom ops you layer on top.
