# Roof module — Gable

> Module guide for the **gable** roof typology. It loads into the system prompt **only
> when the user picks the Gable roof** (or a structure that selects it), so an unused
> roof guide never costs tokens. There is NO roof template — you build the roof yourself
> with ordinary ops, on top of `05-building-houses.md` and the `roof` op.

## What a gable roof is

Two slopes rising to a single straight **ridge**, with a **triangular gable wall**
closing each end of the ridge. It's the default cottage/house roof: simple, clearly
pitched, and the natural home for an attic in the void underneath.

## How to build it

1. **One roof only.** Emit a single `roof` op with `style: 'gable'` over the wall box —
   never two roofs, never a flat lid. Example:
   `{ op: 'roof', from: [x0, wallTop+1, z0], to: [x1, y1, z1], state: <stairs>, style: 'gable', ridge: 'z', fill: <wall> }`.
2. **Pick the ridge axis.** Run the ridge along the **longer** footprint axis so the
   slopes face the long walls (`ridge: 'x'` or `'z'`). On a square plan either reads fine.
3. **Overhang + fascia.** Extend the eave **1 block past the walls** and add a fascia
   course (slabs/stairs) under it — a flush roof is the #1 "boxy" tell.
4. **Close the gable ends.** Fill the triangular gable wall at each ridge end with the
   wall material (the `roof` op's `fill` handles this); add a small gable vent or window
   if there's an attic behind it.
5. **Attic lives inside this one roof.** If the build has an attic, it's the floored
   space *within* the gable void — don't add a second roof for it.

## Avoid

- A second roof, or a flat slab "roof" on a house.
- Zero overhang (walls and roof flush) — always overhang the eave by 1 and add a fascia.
- A ridge so shallow the roof reads flat — keep a real pitch.
