# Basement module — Modular undercroft

> Module guide for the **modular** basement typology. It loads into the system prompt
> **only when the user picks the Modular basement** (or a structure that selects it), so
> an unused basement guide never costs tokens. The module is selectable in the composer
> Details as guidance; its `build()` geometry is **not yet wired into `composeStructure`**
> (`src/main/structure/domain/basements/`), so for now build it yourself with ordinary
> ops following the direction below.

The modular basement will attach a large, multi-room undercroft beneath a host structure:
a sealed stone shell on a varied footprint (rect/L/T/U/plus), a grid of lit support
pillars, and — as it grows — distinct connected rooms off corridors (library, store,
forge, vault…), stairs/landings linking it to the surface, and at least one taller
pillared hall. Until it lands, build large basements by hand following
`08-complex-structures.md` §"Multi-room underground complex".

Below-grade openings use **`iron_bars`** (barred cellar vents), never clear `glass`/`glass_pane` —
a glass window looking out into dirt reads wrong underground.
