# Structure module — Houses & small homes

> Module guide for the **house** structure type. It loads into the system prompt only
> when a house is selected (or the prompt asks for one). **There is NO house template** —
> you design and build the whole house YOURSELF with ordinary ops. The core construction
> recipes live in `05-building-houses.md`, `10-design-principles.md`, and
> `12-exterior-and-facade-detailing.md`; this file is the house-specific playbook on top
> of them.

## Build it yourself — no preset, no stamped shell

Do **NOT** emit `{ op: 'template', name: 'house' }` — `house` is not a template, and a
fixed stamped shell (the thing that made every house look identical) is exactly what we
do not want. Build the massing from scratch so each house reads as its own structure:

1. **Plan the massing first.** Pick a footprint that is NOT just a square box — an L, a T,
   a wing + a porch, an off-centre entrance, a projecting bay. Decide the storey count and
   where the roof ridge runs. A house's character is in its silhouette and roof, so spend
   your thinking here.
2. **Shell, not solid.** Lay the body as a `hollow` (or `walls` + a floor `fill` + a
   ceiling/attic-floor `fill`) — NEVER a solid `fill` of the whole box (that buries the
   interior). Add a foundation slab a course or two into the ground so it sits grounded,
   not floating.
3. **One roof, with the `roof` op.** Emit a single pitched/edged roof with the `roof` op
   (gable or hip) — never two roofs, never a flat lid on a house. Give it a **1-block
   overhang** past the walls and a fascia course under the eave (a flush roof is the #1
   "boxy" tell). The attic, if any, is the floored space *inside* this one roof.
4. **Floors as separated slabs.** For a multi-storey house, `fill` a floor slab at each
   storey height (full, separated storeys — no half-height mezzanines).
5. **Circulation with the `stairs` op.** Link every walkable level with ONE flight per
   rise using the `stairs` op (pass `fill` for tread support and `clear` to carve the
   stairwell hole + headroom). Never hand-place `*_stairs`, never stack a second inverted
   run, never run a flight into a ceiling. **Inset the stair core ≥1 cell off the outer
   walls** — never glue the flight to a wall or jam it in a corner; the bottom step and the
   cell you stand in to climb need open floor beside them. **In a tight footprint** (a small
   plan with no room for a flight PLUS a breathing-room landing at the bottom and top), don't
   cram a flight into a corner — climb with a flush **wall ladder** instead: a `ladder` column
   against an inner face of an outer wall, rising through a 1×1 hole carved in the upper floor.
   A ladder is one cell wide, so it fits where a flight can't. Reach an attic the same way — a
   wall ladder through a carved hole, never a flight punched through the roof.
6. **Openings.** Carve window holes and a door gap in the otherwise-solid walls (fill an
   air index), then seat a real `*_door` in the doorway (solid jambs both sides, a floor
   beneath, hinge/facing so it opens into the room) — never leave a bare gap.
7. **Light every level** with a VISIBLE fixture (hanging lantern under a ceiling, a wall
   torch, etc.) — never `minecraft:light`.

## Refinement checklist (layer these on top)

1. **Roof overhang + depth.** Extend the roof one block past the walls and add a fascia
   (a slab/stair trim course) under the eave. A flush roof is the #1 "boxy" tell.
   - **Chimney (one, complete).** If the house has a hearth, give it **exactly one** chimney:
     a continuous `bricks`/`stone_bricks` column with no gaps, seated on the firebox and
     running unbroken up and **through the roof** to ~1–3 blocks past the ridge, capped with a
     `campfire`/trapdoor **resting on the top block**. Never a second stray chimney, a stack
     that stops below the roofline, or a campfire floating above the column.
2. **Entrance.** Seat the `*_door` in the opening, add a 1–2 block stoop/step, and frame
   the door with the `accent` material or a small porch overhang. Light it (lantern/wall
   torch beside the door).
3. **Windows with depth.** Recess panes one block, or add a sill (slab) and a lintel
   (stair/trapdoor) so windows aren't flush holes. Group them rhythmically (pairs),
   centred and symmetric per wall.
4. **Wall texture.** Break a flat plank/stone wall with an `accent`: corner quoins, a
   mid-wall string course, or exposed timber framing (logs around windows/corners) for a
   cottage look.
5. **Interior.** Furnish per floor from `06-decoration-and-interiors.md` /
   `11-furniture-and-interior-detailing.md`: a hearth, table+chairs, beds upstairs,
   storage, rugs. Light every room. Appliances against a wall keep the wall block behind
   them and face into the room. Decoration goes in AIR cells — never overwrite a wall.
6. **Grounding.** A path to the door, a flower box under a window, a low fence or garden
   edge — so the house sits in a place rather than floating.

## Sizing guidance

- A cosy single-storey cottage: ~7–9 wide × 6–8 deep × 6–7 tall.
- Two storeys: add ~4–5 height per extra floor; keep rooms ≥ 4×4 interior.
- Keep the footprint calm (a clean rectangle or a simple L) — houses read best with quiet
  massing and the detail in the roof/facade, not a jagged plan. But DO vary it run-to-run:
  shift the entrance, add a wing or porch, change the roof form — never the same shell.

## Common house mistakes

- A single material for walls **and** roof **and** trim → flat. Use 3–5 cohesive
  materials (the `cozy` decoration already spreads wall/floor/roof/accent for you).
- No roof overhang, flush windows, a door with no frame or step.
- A solid `fill` body that buries the interior; two roofs; a flat-lidded house.
- A second/stray chimney, a chimney that stops below the roofline (doesn't pierce the roof),
  or a campfire floating in the air above the stack instead of resting on it.
- Stairs that don't connect every level, a flight punched through the roof, or a flight glued
  to a wall/corner with no standing room beside it (keep the core ≥1 cell off the walls).
- Forgetting interior light → dark, dead rooms in the preview.
