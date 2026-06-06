# Basement module — Crypt

> Module guide for the **crypt** basement typology. It loads into the system prompt **only
> when the user picks the Crypt** (or a structure that selects it), so an unused basement
> guide never costs tokens. The module ships real `build()` massing
> (`src/main/structure/domain/basements/crypt.ts`): a sealed vault, a central aisle,
> catacomb columns, burial niches, and soul-lantern light. **You add the dressing** — the
> block-built props below — on top of that shell. Pairs best with the
> [`haunted`](../decoration/haunted.md) decoration.

## What a crypt is

A **sunken burial vault** below the building: a sealed stone undercroft (no exterior glass —
it's buried), a **central processional aisle** running its length, rows of **catacomb
columns** flanking the aisle, tiers of **burial niches (loculi)** recessed along the long
walls, and the cold blue glow of **soul lanterns**. Reached by the building's stair core.

## The massing the module builds (so you don't have to)

- A sealed floor + ceiling + four walls (deepslate/bone kit by default; the decoration
  repalettes it — under haunted it weathers to cracked deepslate).
- A slab **cornice** ringing the wall under the ceiling.
- A **bone aisle runner** down the centre of the floor.
- Two rows of **columns** flanking the aisle, each capped with a hanging soul lantern.
- **Burial-niche shelves** (a bone shelf + slab lintel) along both long walls, with a wall
  lantern every other niche.
- Mossy/cracked **decay** patches on walls and floor.

## The dressing you add (block-built — all of it renders in the preview)

1. **Fill the niches.** In each wall niche set a `skeleton_skull` or `wither_skeleton_skull`
   on the bone shelf (skulls **render** — see [`04`](../../04-block-entities.md)), a
   `bone_block` or two, and a `cobweb` across the opening. A few niches get a `decorated_pot`
   (a funerary urn) instead.
2. **A central tomb / sarcophagus.** Mid-aisle, build a raised sarcophagus: a 1×3 box of
   `chiseled_deepslate`/`deepslate_bricks` with a `deepslate_brick_slab type:top` lid and a
   `deepslate_brick_stairs` headstone at one end. Crown it with `candle`s (1–4, black) and a
   `soul_campfire` for a body laid in state, or set a `skeleton_skull` on the lid.
3. **Candles & cold fire.** Scatter `candle`/`black_candle` clusters on the cornice ends,
   niche shelves, and the tomb. A `soul_campfire` (blue flame) or a lit `campfire` gives the
   single warm point in the vault.
4. **Cobwebs & bones.** `cobweb` in every ceiling corner and across the aisle arches; piles
   of `bone_block` in the corners; `chain` hanging from the ceiling between columns.
5. **An ossuary wall.** One end wall can be a stacked `bone_block` + `skeleton_skull` display
   (catacomb-style), framed by `deepslate_brick_stairs`.
6. **Standing water / sculk.** A `cauldron` of dark water, `sculk`/`sculk_vein` creeping up a
   damp corner, `mossy_cobblestone` patches where the vault leaks.

## Avoid

- Glass windows below grade (it's buried — there are none; light from within only).
- A sealed box with no stair connection to the building above (the circulation pass carves
  the stair down — keep the ceiling otherwise solid so terrain can't reveal it).
- Leaving it pitch black: buried rooms go fully dark, so keep the soul lanterns and add
  candles. Dread needs *just enough* light to see the bones.
- Relying on paintings/item-frames for the mood — they **don't render** in the self-review
  preview ([`11`](../../11-furniture-and-interior-detailing.md)). Use skulls, cobwebs,
  candles, bones, and decorated pots, which do.
