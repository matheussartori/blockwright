# 11 — Furniture construction & interior detailing

[`06`](06-decoration-and-interiors.md) tells you *what furniture to place and where* (room
composition). This file is the **block-by-block construction grammar** for the furniture itself —
the "trained builder" vocabulary that separates a convincing, lived-in cottage or grand mansion
hall from a few props on a bare floor. Every recipe here is built from ordinary blocks; the moves
are **stairs + trapdoors + slabs**, layered light, and framed walls.

> **Preview-fidelity caveat (important):** `item_frame`s, `painting`s, and `armor_stand`s are
> **entities — they do not render in Blockwright's preview** ([`08`](08-complex-structures.md)).
> They look great in-world, so use them, but **never rely on them to fill a wall in the self-review
> loop** — back every wall with *block-built* detailing (trapdoor shelves, slabs, bookshelves,
> plant columns) that actually shows up in the preview, then add frames/paintings on top.

Conventions below: `@` = the anchor cell, `x+`/`y+`/`z+` = offsets, "facing" follows
[`03`](03-blocks-and-blockstates.md) (stairs ascend toward `facing`; the tall riser is on that
side). Always confirm orientation in the preview.

---

## Seating — sofas, armchairs, benches

The signature interior move. A sofa is **stairs for the seat + open trapdoors as armrests**.

### Sofa / couch (the canonical build)
- **Seat/back:** a row of `*_stairs` all facing the *same* way, the tall riser as the backrest. A
  sofa whose back is on the north (you sit facing south) = `*_stairs facing:north`, in a row along
  x: `@`, `@ x+1`, `@ x+2` for a 3-seater.
- **Armrests:** an `*_trapdoor open:"true"` standing vertical at each end, capping the row (one just
  past `@` on the −x side, one past the last seat on +x). They read as padded arms.
- **Optional higher back:** a second row of `*_trapdoor open:"true"` (or a `*_wall_sign`/banner)
  behind the stairs for a wing-back look.
- **Two-tone cushions:** swap the stair material for a lighter wood, or set a `*_slab` seat of a
  contrasting wood between trapdoor arms (see images of light-cushioned spruce sofas).

```
Top-down, 3-seat sofa facing south (T=trapdoor arm, S=stair facing:north):
T S S S T
        ↑ player sits facing this way (south)
```

### Armchair
A **single** `*_stairs` + a `*_trapdoor open` arm on each side. A `*_trapdoor` or `*_wall_sign` on
the wall behind = the back. Perfect flanking a fireplace.

### Bench / window seat / pew
A row of `*_stairs` facing one way (no arms), or `*_slab type:bottom` on a low `*_stairs half:top`
plinth, set under a window or along a hall wall. Grand halls (see the great-hall reference) line
both long walls with stepped `*_slab`/`*_stairs` pew benches.

> **Seating set:** two sofas **facing each other** (one `facing:north`, one `facing:south`) across a
> coffee table, on a rug, aimed at a fireplace or window — the standard living-room composition.
> An L-shaped sofa wraps a corner; verify each segment's `facing` in the preview.

---

## Tables

Keep tops **thin** and legs **on the floor** (see [`06`](06-decoration-and-interiors.md) Tables —
no full-block or `double`-slab tops).

- **Coffee table (trapdoor skirt):** a central `*_fence`/full-block leg at `@`, ringed by
  `*_trapdoor open:"true"` on its open sides as an apron, topped with a `*_slab type:top` or
  `*_pressure_plate` at `@ y+1`. Reads as a low slatted table. Add a `flower_pot`/`candle` on top.
- **Dining table:** a run of `*_stairs half:top facing` inward from both long sides meeting under a
  `*_slab type:top` lane — or fences-under-corners + a `*_slab type:top` surface. Pair with stair
  **chairs** (`*_stairs` facing the table, trapdoor arms optional) down each side.
- **Side/end table & nightstand:** a single `barrel`, `*_slab`-on-`*_fence`, or
  `chiseled_*`/`*_log` block, with a `lantern`/`candle`/`flower_pot` on top (see references — small
  tables flank every sofa).

---

## Fireplaces (the focal point of a living room/hall)

A fireplace anchors the whole room in the references. Build the **chimney breast**, **firebox**,
**mantel**, and a **surround accent**:

- **Chimney breast:** a 1- or 3-wide column of `stone_bricks`/`bricks`/`deepslate_bricks` running
  floor → ceiling, projecting 1 block out from (or recessed into) the wall for depth.
- **Firebox:** a recess at floor level holding a `campfire` (best — it renders flame + smoke and is
  the cleanest "fire" block) or a lit `furnace`, framed by the brick. The campfire sits on the solid
  hearth block, the right way up ([`10`](10-design-principles.md) §Physical validity).
- **Mantel shelf:** a `*_slab type:top` or `*_stairs half:top` ledge above the firebox; dress it
  with `flower_pot`s, `candle`s (on the slab), a clock-in-a-frame, or `decorated_pot`.
- **Hood / corbel:** narrow the breast up to the flue with `*_stairs half:top` brackets.
- **Surround accent:** a `chiseled_*`, `prismarine`/`diamond_block`, or `quartz` motif set into the
  breast above the mantel (see the cool-stone living-room reference) lifts a plain chimney.
- Flank the hearth with two **armchairs** and a **log/bookshelf** column.

```
Front of a fireplace (B=stone brick, _=slab mantel, F=campfire firebox):
B B B B B
B  ACCENT B
B _ _ _ B   ← mantel shelf (slab type:top), props on it
B B F B B   ← firebox at floor (campfire on hearth)
```

---

## Bookshelf walls, studies, storage furniture

- **Library wall:** full-height columns of `bookshelf`/`chiseled_bookshelf` framed by `*_log` posts
  every few blocks; the colorful `chiseled_bookshelf` spines read as a real library (see hall and
  living-room references). Add a `lectern` and an armchair = a reading nook.
- **Cabinets / dresser:** stacks of `barrel`s with `*_trapdoor` doors, or `*_trapdoor`s mounted flat
  on the wall over a counter as **upper cupboards**.
- **Wardrobe:** a 1×2 column of `barrel`s or a pair of `*_doors` set into a wall recess.
- Storage `chest`/`barrel`: opening faced at the open room, on a solid block (never into a wall — see
  [`10`](10-design-principles.md)).

---

## Kitchens & counters

- **Counter run:** full blocks (or `*_stairs half:top`) topped with `*_slab type:top`, with
  `*_trapdoor` cabinet doors on the front face; turn the corner for an L.
- **Stove:** a `smoker` + `furnace`/`blast_furnace` (`lit:"true"`) set into the counter line.
- **Sink:** a `cauldron` (or `water_cauldron`) dropped into the counter at counter height, a
  `*_trapdoor`/lever faucet on the wall behind.
- **Upper cabinets:** `barrel`s/`*_trapdoor`s mounted high on the wall; a `lantern` under one for
  task light.
- **Food art:** `item_frame`s of steak/bread/fish above the counter (entities — won't preview, see
  caveat), plus a block-built backsplash (`*_slab`/`stone` wainscot) that *does* preview.
- **Dining nook:** a stair-and-trapdoor **table + chairs** set beside the kitchen (see the rustic
  kitchen/dining references).

---

## Walls & ceilings — the detailing that reads as "decorated"

Bare interior walls and flat ceilings are the #1 "unfinished" tell. The references all break them:

### Wall treatment
- **Wainscoting:** the lower 1–2 courses in a different material (a `stone_brick`/`*_log` dado)
  under a plank upper wall — instant depth, classic in cottages and the rustic kitchen reference.
- **Framing (Tudor):** `*_log axis:y` posts at corners and every ~4–5 blocks, an `axis` belt at the
  top, `planks`/`terracotta` infill ([`05`](05-building-houses.md) §Tudor) — works indoors too.
- **Living plant accents:** a vertical column of `*_leaves`/`flowering_azalea_leaves`/`moss_block`/
  `vine` set between two log posts (the green strips in the wood-cabin references) — bring the
  outside in; make sure it touches solid blocks.
- **Art:** `painting`s and grids of `item_frame`s (entities — won't preview), over a block-built
  backing so the wall isn't empty in the preview.
- **Sconces:** a `wall_torch`/`lantern` on a `*_trapdoor` bracket, or a `lantern` hung off a
  wall-mounted `*_fence` arm.

### Ceiling treatment
- **Exposed beams:** `stripped_*_log`/`*_wood` with `axis` running along the room, set one block
  below the ceiling plane every ~3 blocks (every wood-interior reference does this).
- **Coffered / stepped border:** ring the ceiling edge with `*_slab type:bottom` or `*_stairs
  half:top` to frame it and drop the centre — reads as a tray ceiling (cool-stone living-room
  reference).
- **Hanging lights:** `chain[axis:y]` → `lantern hanging:"true"` dropping from a beam (see below).

---

## Lighting fixtures (built, not just placed)

[`06`](06-decoration-and-interiors.md)/[`10`](10-design-principles.md) cover *where*; here's *how*:

- **Pendant lantern:** `chain` → `lantern hanging:"true"` from the ceiling/beam over a table or
  seating group — the most-used fixture in the references.
- **Chandelier (cottage):** a hub block (`*_fence`/`*_wall`/`*_log`) hung on `chain`, with
  `lantern hanging:"true"` and short `chain` arms radiating.
- **Grand-hall chandelier:** a tall central `chain`/`iron_bars`/`end_rod` spine descending from the
  high ceiling, with tiers of `lantern hanging:"true"` stepping outward — see the great-hall
  reference. Scale it to the volume; a tiny lantern in a 10-tall hall looks lost.
- **Wall sconce:** `lantern`/`wall_torch` on a `*_trapdoor` or `*_fence` wall bracket.
- **Indirect/cove light:** `glowstone`/`sea_lantern`/`shroomlight` tucked behind a `*_slab`/
  `*_trapdoor` valance or recessed into the wall, so you see glow, not the block (the diamond/
  sea-lantern uplights high on the great-hall walls).
- For dark/gothic halls lean on `soul_lantern` + `candle`s. **Never** `minecraft:light`
  ([`03`](03-blocks-and-blockstates.md)).

---

## Rugs & floor patterns

Floors carry a lot of the "designed" feel in the references — don't leave them a single plank:

- **Bordered rug:** a filled rectangle of one `*_carpet`, ringed by a contrasting `*_carpet` border;
  a `moss_carpet` or `snow layers:1` edge gives the soft "fuzzy" frame seen in the cozy
  living-room references. (Carpets/snow need a solid block beneath — [`10`](10-design-principles.md).)
- **Checkerboard rug:** alternate two `*_carpet`/`*_wool` colors (e.g. cyan + purple, as in the
  kitchen-diner reference) for a patterned mat.
- **Hall runner:** a central strip of `*_carpet` (e.g. red), optionally flanked by black, run down
  the main aisle of a hall toward the focal point (great-hall reference).
- **Two-tone flooring:** alternate or diagonally cross two floor blocks — `terracotta`+`stone`,
  `planks`+`*_slab`, polished stone + wood — for a tiled look (the orange-terracotta room).
- Echo the palette: warm woods get red/orange/brown rugs and warm lights; cool stone halls get
  deep reds, blacks, blues.

---

## Putting a room together (fidelity targets)

For a **cottage living room**: framed/wainscoted walls + beamed ceiling, a fireplace focal wall,
two facing stair-sofas + trapdoor coffee table on a bordered rug, a bookshelf column, a side table
with a lantern, plant accents, pendant lights. Fill ~⅓–½ of floor/wall area
([`06`](06-decoration-and-interiors.md) density target).

For a **mansion great hall**: tall stone-brick walls with pilasters and a crenellated/ stepped
upper gallery, a tiered chandelier down the centre, sea-lantern/glowstone cove uplights, bookshelf
and bench alcoves down both long walls, a carpet runner to a focal wall (altar/throne/large window),
grand stair flights on each side. Scale fixtures to the volume.

> Audit (catch in the preview, see [`07`](07-workflow.md)): every sofa/table/fireplace **supported
> and on the floor**; tops **thin**; containers **facing the room**; rugs/carpets/candles on solid
> blocks; walls and ceiling **detailed in real blocks** (not relying on invisible item-frames); a
> light source ~every 6 blocks; one clear focal point per room.
