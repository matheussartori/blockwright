# Basement module — Full cellar

> Module guide for the **full cellar** basement typology. It loads into the system prompt
> **only when the user picks the Full cellar** (or a structure that selects it), so an
> unused basement guide never costs tokens. Build it yourself with ordinary ops, on top
> of `05-building-houses.md` and `08-complex-structures.md`.

## What a full cellar is

A complete storey **fully sunk below grade**, the **same footprint** as the floor above,
entirely buried — no walk-out, no exterior glass. Good for storage, a workshop, a vault,
or a wine cellar.

## How to build it

1. **A real, separated storey below ground.** `fill` a floor slab at the cellar floor,
   the wall box around it, and a solid ceiling slab that doubles as the ground floor's
   floor — a clean storey, not a crawlspace.
2. **No glass into dirt.** A glass window looking into soil reads wrong underground. For
   light use **`iron_bars`** as barred vents set **high** on the wall (near the ceiling),
   or skip openings entirely and light it from inside.
3. **Light it from within.** Lanterns, a hanging lantern, or torches — a buried room is
   dark, so place lighting generously.
4. **Connect it to the stair core.** The cellar is reached by the building's stairs from
   the floor above (see the `stairs` op / circulation pass) — don't strand it.
5. **Foundation feel.** Use a heavier, stony material (cobblestone, stone bricks, deepslate)
   so it reads as a foundation level, distinct from the warmer floors above.

## Avoid

- Glass windows below grade (use barred `iron_bars` vents instead).
- A sealed box with no stair connection to the building above.
- Skimping on light — buried rooms go pitch black.
