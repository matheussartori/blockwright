# Basement module — Half-buried

> Module guide for the **half-buried** basement typology. It loads into the system prompt
> **only when the user picks the Half-buried basement** (or a structure that selects it),
> so an unused basement guide never costs tokens. Build it yourself with ordinary ops, on
> top of `05-building-houses.md` and `08-complex-structures.md`.

## What a half-buried basement is

A storey sunk **only halfway** below grade, so its **upper course clears the ground**.
That exposed strip leaves room for a real **clerestory window band** that daylights the
room — unlike a full cellar. It reads as a **raised ground floor over a walk-out lower
level**: good for a sunlit den, studio, or semi-basement kitchen.

## How to build it

1. **Set the floor about half a storey below grade.** Roughly half the storey height sits
   below `y=0`, half above — so the top ~2 courses of its walls are above ground.
2. **A clerestory window band in the exposed strip.** Run a band of glass (`glass_pane`
   is fine here, since it's above grade) along the part of the wall that clears the ground.
   This is the whole reason to choose half-buried over a full cellar — use it.
3. **Keep the below-grade part solid.** The buried lower courses get no glass; if you want
   extra venting there, use `iron_bars`, not glass.
4. **Connect it to the stair core.** Reached from the building's stairs (see the `stairs`
   op / circulation pass). A short external stoop down to a walk-out door also reads well.
5. **Foundation feel below, lighter above.** Stony material for the buried courses,
   transitioning to the building's warmer palette where it emerges.

## Avoid

- Burying it fully and then adding windows into dirt (that's a full cellar — pick that
  module instead).
- Forgetting the clerestory band — without daylight there's no reason to choose this over
  a full cellar.
- Leaving it disconnected from the building's stairs.
