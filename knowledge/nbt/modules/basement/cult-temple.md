# Basement module — Cult temple

> Module guide for the **cult-temple** basement typology. It loads into the system prompt
> **only when the user picks the Cult temple** (or a structure that selects it), so an
> unused basement guide never costs tokens. The module ships real `build()` massing
> (`src/main/structure/domain/basements/cult-temple.ts`): a sealed blackstone chamber, a
> raised altar dais, a summoning circle, corner ritual pillars, and soul-lantern light.
> **You add the dressing** — the block-built props below — on top of that shell. Pairs best
> with the [`haunted`](../decoration/haunted.md) decoration.

## What a cult temple is

A **hidden ritual chamber** below the building: a sealed **blackstone** undercroft built
around a **central raised altar dais** with a **summoning circle** inlaid in the floor, four
**corner ritual pillars**, and the cold blue glow of **soul lanterns** — with a single
beam-of-light lantern hanging directly over the altar. Reached by the building's stair core;
the place a cult would never let a guest see.

## The massing the module builds (so you don't have to)

- A sealed floor + ceiling + four walls (blackstone/polished-blackstone kit; the decoration
  repalettes it — under haunted it weathers and darkens further).
- A slab **cornice** under the ceiling.
- A **summoning-circle ring** inlaid in the floor (chiseled blackstone) around the altar.
- A 1-tall **altar dais** with a central **pedestal + slab altar table**, and a **hanging
  soul lantern** above it (the beam of light onto the altar).
- **Four corner ritual pillars**, each capped with a soul lantern.
- Mossy/cracked **decay** patches.

## The dressing you add (block-built — all of it renders in the preview)

1. **The altar fire.** Set a **`soul_campfire`** (blue flame) on the altar table as the focal
   ritual fire, ringed by `black_candle`/`red_candle` (1–4 per block). A `decorated_pot` or a
   `skeleton_skull` flanks it; a `lectern` with an open tome stands before it.
2. **Candle circle.** Run `candle`s of one colour around the summoning ring on the floor, and
   cluster them at the cardinal points — the lit circle is the signature of the rite.
3. **Skulls on the pillars.** Cap or shelf each corner pillar with a `skeleton_skull`/
   `wither_skeleton_skull` (skulls **render** — see [`04`](../../04-block-entities.md));
   string `chain` between the pillars overhead.
4. **Profane materials.** Patch the floor around the altar with `soul_sand`/`soul_soil`, set
   `crying_obsidian`, `magma_block`, or `gilded_blackstone` accents into the dais, and let
   `sculk`/`sculk_vein`/`sculk_sensor` creep out from under the altar.
5. **Offerings & cages.** A `cauldron` of dark water beside the altar, `iron_bars` forming a
   small holding cage in a corner, a `barrel`/`chest` of relics facing the room, `cobweb` in
   the high corners.
6. **Forbidden library.** One wall of `chiseled_bookshelf` + a `lectern` and a `candle`
   reading desk — the cult's grimoires.

## Layout note

Keep the chamber **roughly symmetrical** around the altar (default footprint `rect`) so the
dais, circle, and corner pillars read as a deliberate ritual space — asymmetry undercuts the
sense of a centred rite. Approach the altar straight on from the stair landing.

## Avoid

- Glass windows below grade (it's buried — light from within only).
- Burying the altar in the dark: keep the hanging soul lantern + altar fire + candle circle
  so the centrepiece reads, while the chamber edges stay shadowed.
- A sealed box with no stair connection above (the circulation pass carves the stair down —
  keep the ceiling otherwise solid).
- Relying on paintings/item-frames/armor-stands for the mood — they **don't render** in the
  self-review preview. Use the soul campfire, candles, skulls, sculk, and decorated pots,
  which do.
