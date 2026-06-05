# Decoration module — Cozy

> Module guide for the **cozy** decoration. It loads into the system prompt only when
> the cozy decoration is selected. A decoration is the *look* layered over any structure
> type: it sets the material palette, keeps the build intact (no decay/weathering), and
> guides interior warmth. Select it on a `template` op with `params.decoration: 'cozy'`
> (the default), or just build with this palette by hand.

## The cozy palette (what the decoration maps roles to)

| Role | Block | Notes |
|------|-------|-------|
| wall | `spruce_planks` | warm primary surface |
| floor | `oak_planks` | lighter honey tone underfoot |
| ceiling | `spruce_planks` | matches walls |
| foundation | `cobblestone` | grounded stone footing |
| corner / beam / pillar | `spruce_log` | exposed timber frame |
| accent | `stripped_spruce_log` | lighter framing / quoins |
| trim | `spruce_slab` | sills, string courses, eaves |
| roof | `spruce_stairs` | pitched, with overhang |
| window | `glass_pane` · glass `glass` | |
| door | `spruce_door` | |
| light | `lantern` | warm light everywhere |

Keep to this family; if you add materials, stay in the warm range (oak, spruce, dark oak
accents, terracotta, wool for soft spots). **No mossy/cracked/cobweb blocks** — cozy is
lived-in and cared-for, never ruined.

## Cozy intent (apply throughout)

- **Warm light, generously.** Lanterns (hanging from `trapdoor`/fence, or sitting on
  posts), candles on tables, a lit fireplace, sea-pickle/glowstone behind a `barrel` or
  trapdoor for hidden glow. Every room reads warm and bright in the preview.
- **Soft furnishings.** Wool/carpet rugs, beds with wool blankets, banners/paintings on
  walls, bookshelves, flower pots on sills. Use the faux-furniture grammar in
  `11-furniture-and-interior-detailing.md` (stair+trapdoor sofas, barrel nightstands).
- **A hearth.** A fireplace or stove is the heart of a cozy build — `bricks`/stone
  surround, a `campfire` or `magma`-behind-glass glow, a `chimney` up through the roof.
- **Plants & life.** Potted plants, a window flower box (`*_leaves`/flowers in pots),
  hanging vines, a small garden or path outside.
- **Texture over flatness.** Mix planks with exposed `spruce_log` framing; add slab/stair
  trim, recessed windows with sills, and a roof overhang — so the warm palette sits on a
  build with depth, not a flat box.

## Cozy vs. other decorations

Cozy is **intact and warm**. It is the opposite of a ruined/abandoned look: do not punch
decay holes, do not weather blocks, do not scatter cobwebs or broken furniture. If the
user wants ruin, that is a different decoration (not yet available) — flag it rather than
half-applying decay to cozy.
