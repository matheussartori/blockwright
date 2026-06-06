# Basement module — Cellar

> Module guide for the **cellar** basement typology. It loads into the system prompt
> **only when the user picks the Cellar** (or a structure that selects it), so an unused
> basement guide never costs tokens. The module ships `build()` geometry
> (`src/main/structure/domain/basements/cellar.ts`) that lays the sealed shell + pillars;
> you furnish the interior on top with ordinary ops following the direction below.

A cellar is a sunken stone undercroft beneath the building: a SEALED shell on a varied
footprint (rect/L/T/U/plus), a distinct floor and ceiling, and a grid of lit support
pillars. There is **no built-in vertical access** — the ceiling stays solid so terrain
can't reveal it; the circulation pass carves the stairwell down from the floor above, so
leave a clear column where the stair from the ground floor lands.

Furnish it as a useful undercroft — pick what fits the home:

- **Storage / pantry:** rows of barrels and chests against the walls, shelving, sacks
  (composters), labelled crates. The most common use.
- **Workshop:** a crafting table, smithing/fletching/cartography tables, a furnace bank,
  an anvil, a grindstone, tool racks (item frames).
- **Wine/food cellar:** stacked barrels, brewing stands, water/cauldrons, hanging
  lanterns kept low.

Keep it lit (lanterns on pillars or hung under the ceiling — a cellar should never be
dark). Below-grade openings use **`iron_bars`** (barred cellar vents), never clear
`glass`/`glass_pane` — a glass window looking out into dirt reads wrong underground.
For a large multi-room cellar, partition it into real rooms off a corridor following
`08-complex-structures.md` §"Multi-room underground complex".
