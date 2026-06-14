# Room module — Dungeon

> Furniture vocabulary for this room. Scale, preset, and decoration come from the
> `[Room plan]` brief + `14-furnishing-by-space.md`; here is just WHAT to build.

A dungeon is a torture and holding block. The defining moves are **iron-barred cells** and
**instruments of torment** in a cold stone room lit by a few guttering torches.

**Cells:**
- Partition cells with `iron_bars` walls and an `iron_bars` (or `dark_oak`/`iron`) **barred
  door**. The `connectBlocks` pass joins the bar sides, so just place the line.
- Inside: `hay_block`/straw carpet on the floor, **wall shackles** (a `chain` hung from the
  wall to a `tripwire_hook`/iron block), a wooden `cauldron`/composter as a bucket, scattered
  `bone`/`bone_block` and a lone `barrel`.

**Instruments (the open floor):**
- A **rack/torture table**: a frame of stripped logs or `iron` with a `chain` stretched at
  each end (anchor to walls/posts).
- **Stocks/pillory** (a `fence`/`trapdoor` frame), a suspended **iron cage** (`iron_bars`
  box hung by a `chain` from the ceiling), a torture **wheel** (a ring of stairs/trapdoors).
- The **torturer's bench**: an `anvil`, a `grindstone`, a `smithing_table`, a coal **brazier**
  (`campfire`/fire in iron), and a peg wall of tools (`item_frame`d axe/shears, hung `chain`s).

**Drainage & damp:**
- A grated **drain** in the floor — a recessed line of `iron_bars`/`grate` (or `cauldron`s)
  at the room's low point. Add `water` drips and `slime`/moss patches for damp.

**Scale up:** make it a **corridor** of cells down both walls with the instruments in the
central aisle; line the walls with `chain`s and iron sconces.

**Light:** sparse and cold — `torch`/`soul_torch` set far apart in iron sconces so most of the
block stays in shadow. Floor/walls in `cobblestone`, `cobbled_deepslate`, `stone_bricks` with
mossy/cracked variants. Pairs naturally with a basement.
