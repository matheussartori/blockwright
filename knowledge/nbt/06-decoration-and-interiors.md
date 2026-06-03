# 06 — Decoration & interiors

Minecraft has almost no "furniture" blocks — interiors are made by **combining ordinary
blocks into shapes that read as furniture**. This is the most "trained-builder" part of the
job: a table is a fence + pressure plate; a chair is a stair + signs. Below are the
canonical recipes. Mix and match, keep materials cohesive with the build.

> Reminder: Blockwright renders block geometry but not item-frame contents or sign text. So
> these faux-furniture shapes preview accurately, which makes them ideal to validate.

> This file is the **placement & room-composition** layer (what furniture, which wall, how dense).
> For the **block-by-block construction grammar** — how to actually build a convincing sofa,
> fireplace, dining set, chandelier, layered rug, or beamed ceiling at reference quality — see
> [`11-furniture-and-interior-detailing.md`](11-furniture-and-interior-detailing.md).

## Faux-furniture recipes

Each recipe lists blocks and their relative placement (`@` = the anchor cell).

### Tables
- **Small table**: `oak_fence` (or any fence) at `@`, with a **carpet** or **pressure plate**
  on top (`@ y+1`). For a wider table, put fences under each corner and a `*_slab type:top` on
  top, or use a row of `*_slab type:top`.
- **Keep the top thin, and the leg on the floor.** The tabletop is a *single* `*_slab type:top`,
  carpet, or pressure plate — **never a full block or a `double` slab** (that reads as a thick,
  clumsy slab, not a table). And the fence/post leg must run down to a real floor: a table whose
  top hovers with air under the leg is floating. Post at `@ y`, thin top at `@ y+1`, floor at
  `@ y-1`.
- **Desk**: a `*_stairs` upside-down (`half:top`) reads as a desk/counter with knee space.

### Chairs / stools / benches
- **Chair**: a `*_stairs facing:<toward table>`, with `*_sign`/`*_wall_sign` on the two sides
  as armrests (optional). A `*_trapdoor` on the back wall behind it = backrest.
- **Stool**: a single `*_slab` or upside-down stair.
- **Bench**: a row of stairs all facing the same way.

### Kitchen / counters
- **Counter**: row of `*_stairs half:top` or full blocks topped with `*_slab`.
- **Sink**: a `cauldron` (optionally `water_cauldron level:3`) set into the counter at *floor/counter
  level* — a cauldron always rests on a solid block the right way up, never hung from a ceiling or
  floated on a wall — with a `*_trapdoor` or lever as a faucet on the wall behind.
- **Stove/oven**: `furnace`/`smoker facing:out` in the counter line; `lit:true` if "cooking".
- **Hood/cabinets**: `*_trapdoor`s on the wall above; `barrel`s = base cabinets.
- **Pantry**: `barrel`s, `decorated_pot`s, `composter`, hanging `lantern`.

### Storage
- `chest`/`barrel` for storage (set `facing`). Stacks of `barrel`s with `trapdoor` doors read
  as a cupboard. `bookshelf` walls + `lectern` = a study/library.
- **Face the opening at open space, and stand it on a block.** A `chest`'s `facing` (and a
  `barrel`'s `facing`) is the side you **open from** — point it at the room/aisle the player
  stands in, **never into an adjacent wall or another block** (a chest opening into a wall is
  unusable and reads as a bug). Push the chest's *back* against the wall and its front into the
  open. A wall-side `barrel` can instead use `facing:up` (lid on top). And like every floor
  fixture, a chest/barrel must rest **on a solid block** — never floating over air or perched
  above a stairwell where it blocks the passage.

### Beds & bedrooms
- `*_bed` (2 blocks, see [`03`](03-blocks-and-blockstates.md)): put the **head against a wall**
  and the **foot toward the room** so it reads as a real bed. Don't strand it floating, mid-floor,
  or wedged at an odd angle — a bed belongs along a wall or in a corner.
- **Nightstand**: a `barrel` or `oak_slab`-on-fence beside the bed head, with a `lantern`,
  `candle`, or `flower_pot` on top.
- **Headboard**: trapdoors or a banner on the wall behind the head.
- **Wardrobe**: 1×2 column of `barrel`s or doors set into the wall.

### Lighting (do this everywhere — dark builds look unfinished)
- `lantern` (floor or `hanging:true` under a slab/fence), `wall_torch`, `candle`s on tables,
  `sea_lantern`/`glowstone` hidden behind `*_trapdoor` for indirect light, `campfire` (cozy),
  `froglight` (modern). Aim for a light source roughly every ~6 blocks.

### Soft furnishings
- **Rug/carpet**: `*_carpet` (16 colors) on the floor — and **always directly on top of a solid
  block.** A carpet (like a pressure plate, rail, or torch) has nothing to cling to over air and
  **breaks the instant the structure is placed in-game**, so never float one or lay it across a
  gap/stairwell. Layer two colors for a patterned rug.
- **Curtains**: columns of `*_wool`/`*_carpet`-on-wall (use banners for hanging cloth).
- **Cushions/sofa**: stairs in a U with carpet/slab tops, wool accents.

### Plants & nature
- `flower_pot` → `potted_*` variants on sills/tables.
- `oak_leaves` + `oak_log` for an indoor tree; `bamboo`, `hanging_roots`, `vine`.
- Window boxes: `oak_trapdoor` shelf holding `flower_pot`s outside the window.

### Bathroom (whimsical, players love it)
- **Toilet**: `cauldron` with a `*_trapdoor` lid behind; or quartz stairs + slab + button flush.
- **Bath**: a ring of `quartz_slab`/blocks holding `water`; `tripwire`/`lever` taps.
- **Mirror**: an `item_frame` with a map, or a framed `glass`/`white_stained_glass` panel.

### Decorative details that sell a room
- `item_frame`s with maps/tools as wall art (entities — keep modest).
- `painting`s.
- `chain` + `lantern` hanging fixtures.
- `decorated_pot`, `*_banner`, `bookshelf`/`chiseled_bookshelf`, `armor_stand` (entity),
  `cake`, `brewing_stand` (lab), `bell`, `note_block`, `jukebox`.
- `cobweb` as a *single stray strand* tucked in a corner or ceiling angle for "abandoned" — never a
  run of them, and never as a stair/ladder/path (you can't climb cobweb; see
  [`10`](10-design-principles.md) §Physical validity). `candle` clusters for "ritual/cozy".

## Composing a furnished room

> **An empty room is the most common interior failure — and a worse one than a slightly busy
> room.** A few sticks of furniture lost in a big bare floor reads as unfinished. Every room a
> player can enter must look *lived-in and used*: furnished against the walls, decorated, lit,
> with only the middle left as walking space. Aim to dress **all four walls**, not just one.

Build each room up in layers until it feels inhabited:

1. Decide the room's **function** (kitchen, bedroom, living room) from the prompt.
2. Place the **big anchor** first (bed / counter run / dining table) against a sensible wall.
3. **Furnish the perimeter.** Line the walls with function pieces and storage so no wall is bare:
   a kitchen gets counters + cabinets + pantry along two walls; a bedroom gets bed + nightstand +
   wardrobe + a chest or bookshelf; a living room gets a sofa + fireplace + shelves + a side table.
   Push furniture **against walls and into corners**, keeping the centre open.
4. Add **circulation** — leave a 1–2 cell walking path through the middle; don't block doorways.
5. Add **lighting** (a visible source every ~6 blocks, plus one feature light per room).
6. Add **decoration on the walls and surfaces**, not just the floor: paintings/item-frames,
   banners, wall trapdoors/shelves, potted plants on sills and tables, a rug/carpet, books, a
   clock/compass in a frame. Bare walls and bare floors are what make a room look empty.
7. Echo the build's **material theme** (oak build → oak furniture, warm lights).

**Density target:** a furnished room should fill roughly **a third to half of its floor and wall
area** with furniture, storage, and decoration, with the rest as deliberate open space. Restraint
means *avoiding random clutter in the walking path* — it does **not** mean leaving rooms nearly
empty. When in doubt for these builds, add one more piece against a wall rather than leaving it bare.

## Style presets (quick starting points)

- **Cozy cottage**: oak + wool, lanterns, rugs, flower pots, bookshelf nook, fireplace.
- **Rustic farmhouse**: spruce + cobblestone, barrels, hay, composter, hanging lanterns.
- **Modern**: quartz/concrete/glass, hidden lighting, froglight, minimal props, flat surfaces.
- **Medieval**: stone bricks + dark oak, banners, chandeliers (chain+lantern), brewing/anvil.
- **Abandoned/ruined**: cobwebs, cracked/mossy variants, missing blocks, vines, no light.

## Common decoration mistakes to avoid

- **Leaving rooms empty.** A near-bare room with one item in the corner is the #1 interior failure —
  furnish the perimeter of every room (see "Composing a furnished room" above).
- Leaving rooms dark. Always light them.
- Bare walls. Hang art/banners/shelves/plants; don't decorate only the floor.
- Furniture floating or blocking the door. Keep furniture against walls and the door/path clear.
- A lantern or candle "floating" with nothing under or above it — set lights on a block or hang
  them with `hanging:true` (see [`10`](10-design-principles.md) §Physical validity). **`candle`s
  always sit on top of a solid block** (table, slab, shelf) — they can't hang and they break if
  placed on air.
- A carpet, pressure plate, torch, or rail laid over air or a gap — these need a solid block
  directly beneath or they break on spawn; never float them or run them across a stairwell.
- A `chest`/`barrel` facing into a wall (you can't open it) or perched over a stairwell blocking
  the passage — face the opening at the open room and stand it on a solid block.
- A floor lantern/torch/prop dropped in the middle of a corridor, doorway, or stair, blocking the
  walking path — keep lights against walls or hung from the ceiling, never in the lane the player walks.
- A cauldron/furnace/pot stuck to a ceiling or wall — these are floor fixtures; they rest upright on
  a solid block. Use `chain`+`lantern` or a hanging sign for anything that should hang from above.
- Cobwebs used as a staircase, ladder, or path — cobweb can't be climbed or walked on; build real
  stairs or a wall-backed ladder instead, and keep cobweb to a stray corner strand.
- Over-cluttering the *walking path*. Keep the centre open — but that's not a license to leave
  rooms empty; the clutter to avoid is in circulation space, not against the walls.
- Mixing too many wood/stone types — pick 2–3 and stick to them.
- Forgetting `facing` on stairs/chairs so they point the wrong way (catch this in preview).
