# Furnishing by space — match the furniture to the room

The most common interior failure is a **big room that reads empty**: the same handful of
furniture that fills a small bedroom gets lost in a large hall, leaving a vast bare floor
(see the cavernous shared bedroom with two beds adrift in one corner). The opposite —
cramming a tiny room — is just as wrong. **Furnishing density must scale with the floor
space.**

## The space tiers

Judge a room by its interior floor area (its share of the storey, walls excluded) and
furnish to the tier:

- **Snug** (small, up to ~30 cells): keep it discreet. One focal piece plus one or two
  accents. Leave clear walking space. Never crowd it.
- **Standard** (~30–63 cells): a focal point plus a couple of furniture groups and some
  wall dressing, still leaving an open path through.
- **Grand** (~64+ cells): fill it generously. **Divide it into zones**, repeat furniture
  across the floor (more than one seating/work cluster), anchor the centre, and dress
  every wall. Add pillars, rugs, runners, or low dividers so no big empty stretch remains.
  A grand room should feel inhabited end to end, not furnished in one corner.

Rules of thumb for a grand room so it never echoes:
- **Zone it.** Two distinct activity areas (e.g. a lounge AND a reading corner) beat one
  oversized cluster.
- **Anchor the centre.** A central island, table, rug, brazier, or pillar — never an empty
  middle with everything pushed to the walls.
- **Repeat.** More beds, more shelves, more seating — scale the count to the floor.
- **Break the span.** Columns, half-walls, planters, or rug runners stop a long bare floor.

## Presets are a base; the decoration re-skins them

Each room module ships **furnishing presets**, one per space tier (e.g. a bedroom's *Cot
corner* / *Bedroom* / *Master suite*). A preset is a **decoration-agnostic base layout** —
it names furniture in semantic terms (a hearth, a seating cluster, a wardrobe run). The
house's **decoration master** (cozy, haunted, …) decides the *materials and mood*: the same
"seating cluster" is honey spruce and wool under **cozy** and dark, cobwebbed, candle-lit
under **haunted**. Build the preset's layout, then realise each piece in the active
decoration's palette.

## How the build brief drives this

When the user assigns rooms to floors, the **`[Room plan]`** block in the prompt has already
done the space math for you. For each room it gives:
- the computed **space tier** and approximate area,
- the matching **preset** by name with its **furniture zones** listed,
- a reminder to **re-skin** those zones in the chosen decoration.

Treat that as the spec: build every listed zone, scaled to the stated tier, in the
decoration's materials. If two rooms share a floor, partition the storey into two real,
separated spaces first, then furnish each to its own half-floor tier.
