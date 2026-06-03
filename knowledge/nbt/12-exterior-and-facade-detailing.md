# 12 — Exterior & facade detailing (houses → mansions)

[`05`](05-building-houses.md) builds the shell; [`10`](10-design-principles.md) gives the design
*principles* (palette, depth, roof typology, grounding). This file is the **block-by-block exterior
grammar** — the detailing and massing moves that turn a correct box into a cottage, a Tudor
farmhouse, a Gothic manor, or a grand symmetric mansion, the way the reference builds do. It's the
exterior twin of [`11`](11-furniture-and-interior-detailing.md).

The through-line of every good exterior reference: **a stone base, a timber-framed body, and a
steep contrasting roof with a deep overhang** — plus depth on every face and grounds around it.
Almost everything below serves one of those.

---

## The master move: split the storeys by material

The single most effective exterior technique, in nearly every reference: **don't build one
material top to bottom.** Split vertically:

- **Ground floor = stone:** `cobblestone`/`stone_bricks`/`andesite`/`cobbled_deepslate`, often with
  a slightly **wider footing course** (a plinth). Reads as the masonry base.
- **Upper floor(s) = timber + infill:** `*_log` posts and belts with `planks`/plaster infill
  (Tudor, below). Often **cantilevered out 1 block** past the stone base (a jetty) — the overhang
  shadow line is a classic half-timbered tell.
- **Roof = a third, darker material** (see Roofs).

This three-band stack (stone → timber → dark roof) instantly reads as "designed". Use a 1-block
**string course** (a line of `*_slab`/`*_stairs` ledge) to mark the floor division.

---

## Timber framing (Tudor / half-timber) — the facade workhorse

Frame the wall with wood and fill the panels:

- `*_log axis:y` **posts** at every corner and every ~3–5 blocks along the wall, full storey
  height. Cap corner posts with a `*_slab`/`*_stairs` or a contrasting block for a "capital".
- A horizontal `*_log axis:x`/`axis:z` **belt** (sill) at the top of the wall and at each floor
  division.
- **Infill** the panels between framing with `planks`, **plaster** (`white_concrete`/`diorite`/
  `calcite`/`bone_block`/`white_terracotta`), or `*_wattle`-look (`mud`/`packed_mud`).
- **Diagonal braces:** step `*_stairs` or `*_fence` across a panel corner-to-corner for the classic
  X / chevron timber brace.

```
One half-timber panel (L=log post/belt, #=plaster infill, /=stair brace):
L L L L L
L # # # L
L /#  /  L      ← diagonal braces in the plaster
L # # # L
L L L L L  (sits on the stone base course)
```

Pick **dark** framing (`dark_oak`/`spruce`) over **light** plaster for the strongest Tudor read
(see the medieval-farmhouse references); or light oak framing + warm plank infill for a cozy oak
cottage.

---

## Roofs — steep, dark, deep eaves, with detail

[`10`](10-design-principles.md) §Roofs has the typology table; the exterior *details* that sell it:

- **Contrasting dark material:** roof in `deepslate_tile`/`dark_oak`/`spruce`/`bricks`/
  `nether_brick` **stairs** over lighter walls — every reference does this.
- **Deep overhang (≥1, often 2 on big builds):** the eave projects past the wall; the bigger the
  build, the deeper. Underlight it with a row of `*_slab type:top` soffit.
- **Exposed rafter ends:** under the eave, poke `*_stairs half:top` / `*_trapdoor` / `*_fence`
  **beam tips** out at a regular rhythm — the toothed underside in the manor references.
- **Stepped/layered eave:** a `*_slab` + `*_stairs` trim course along the bottom edge before the
  slope starts, so the roof has a thick fascia, not a thin edge.
- **Multi-gable on big builds:** break the silhouette into several intersecting gables/wings, each
  with its own ridge meeting at valleys — a single giant roof reads barnlike (see the manor and
  symmetric-mansion references).
- **Gothic/manor spire:** a very steep, near-vertical roof rising to a tall point or short
  **mansard**; cap the ridge/peak with **cresting** — a row of `iron_bars`/`*_fence`/`lightning_rod`/
  `pointed_dripstone`/`end_rod` finials (the spiky ridge in the Gothic references).

---

## Dormers

A small gable poking out of a roof slope — adds upper-floor light and breaks a big roof:

- A 1–3-wide box stepping out of the slope, its own little **gable roof** (stairs) and a
  `glass_pane` window, often with a **flower box** on its sill.
- Space dormers on a regular rhythm and align them over the windows below.
- The manor/mansion references line a long roof with 3–5 evenly-spaced dormers.

---

## Balconies, galleries & jetties

- **Cantilevered balcony:** project a `*_slab`/`*_stairs` floor out 1–2 blocks from the upper wall,
  supported visually by `*_stairs half:top` **brackets/corbels** beneath, railed with `*_fence`/
  `*_wall`/`iron_bars`/`*_trapdoor`. Add `flower_pot`s or a flower box along the rail.
- **Posted balcony / veranda:** a balcony or porch floor carried on `*_log`/`*_fence` **posts** down
  to the ground (the covered porches in the cabin references).
- **Railing options:** `*_fence` (simple), `*_wall` + `*_fence_gate` topper (sturdy stone look),
  `*_trapdoor` open between posts (slatted), `iron_bars` (wrought iron, Gothic).
- Reachability: a balcony you can't get onto is decoration — give it a door from the room behind.

---

## Porches, porte-cochères & grand entrances

The entrance is the focal point — scale it to the build:

- **Cottage porch:** a `*_slab`/`*_stairs` roof on two `*_log`/`*_fence` posts over the door, 1–2
  **steps** up, a `lantern`/`wall_torch` each side, flower beds flanking.
- **Porte-cochère / covered entry:** a deeper projecting porch you walk *through*, arched openings
  (`*_stairs half:top` springing to a center block = an arch), stone piers, a balustrade roof
  terrace on top (the manor references).
- **Mansion pediment:** a central projecting bay one storey taller, framed by `*_log`/`quartz`
  **pilasters/columns**, topped with a **triangular gable pediment** over the door — the formal
  symmetric-mansion look. Flank with **double doors** under an arch.
- Always: **recess or project** the entrance (never a flush hole), **frame** the jambs, **step up**
  to it, **light** it.

---

## Windows — divided, arched, framed, planted

[`10`](10-design-principles.md) §Windows covers rhythm/alignment; the exterior detailing:

- **Mullions:** divide a wide glass opening with `*_log axis:y`/`*_fence`/`iron_bars` verticals
  (the log-divided panes in the timber references) instead of one big sheet.
- **Arched tops:** step the top of a tall window with `*_stairs half:top` to a keystone block — for
  stone, Gothic, and church windows.
- **Tall narrow Gothic windows:** 1-wide, 3–5 tall, `*_stained_glass_pane` (red/amber glows warmly
  at night), set in a deep stone reveal — the Gothic-manor signature.
- **Shutters:** `*_trapdoor open` on each side of the window.
- **Sills & flower boxes:** a `*_slab`/`*_stairs` sill below; a **flower box** = a `*_trapdoor` open
  (or `*_slab` ledge) backed by a block, planted with `*_leaves` + `flower`s or `potted_*` on top
  (under nearly every cottage window in the references).
- **Recess** the glass 1 block into the wall for the reveal shadow.

---

## Corner & surface detailing

- **Quoins:** alternate a contrasting block (`*_log`, `chiseled_stone_bricks`, `smooth_stone`) up
  the corners of a stone building for "dressed stone" corners (the medieval town-house reference).
- **String courses / belt lines:** a continuous `*_slab`/`*_stairs` ledge at each floor division
  splits a tall facade into storeys.
- **Plaster + ivy:** drape `vine`/`glow_lichen` (or hang `*_leaves`) down sections of wall for the
  overgrown, lived-in look (the alpine and manor references) — vines need a block to cling to.
- **Mixed-stone noise:** scatter `mossy_`/`cracked_stone_bricks`, `cobblestone`, `andesite` into a
  plain stone wall (~10–20%) so it isn't one flat texture.
- **Base trim:** a 1-block `cobblestone`/`deepslate` plinth, ideally 1 block wider than the wall.

---

## Chimneys & chimney pots

(Modest sizing rule still applies — see [`05`](05-building-houses.md) §Chimneys.)

- A constant-width `bricks`/`stone_bricks` stack anchored to a wall or rising through the roof, ~1–3
  blocks past the ridge.
- **Chimney pots:** top it with `*_fence`/`*_wall`/`flower_pot`/`campfire` "pots", or a cluster of
  them on a grand multi-flue stack (the manor references have several).
- **Smoke:** a `campfire` in the cap reads as a lit, smoking chimney.
- Big houses can have **two or more** chimneys (one per wing/fireplace) — they help balance a long
  silhouette.

---

## Towers & vertical focal points

- A square `stone_brick` **tower** rising a storey above the rest, capped with a steep pyramidal
  roof (stairs to a point) or a crenellated parapet, marks a grand house (the medieval town-house
  reference). Put a feature window or balcony near its top.
- Even a small build benefits from **one element a storey taller** (a stair-tower, a tall central
  gable) to break the symmetry of the massing ([`10`](10-design-principles.md) §Proportion).

---

## Style archetypes (palette + roof + signature moves)

| Style | Walls | Roof | Signature exterior moves |
|-------|-------|------|--------------------------|
| **Cozy oak cottage** | `oak_planks` + `cobblestone` base, `oak_log` frame | `spruce`/`dark_oak_stairs` gable, deep eave | flower boxes, wall lanterns, log corner posts, small porch, garden |
| **Alpine / storybook** | white plaster (`diorite`/`calcite`) + dark `*_log` frame | `deepslate_tile`/`dark_oak`, very deep overhang | cascading vines, balcony with flower boxes, lantern facade, stone base |
| **Tudor / medieval farmhouse** | `stone_brick` base + dark-oak half-timber + plaster | steep `dark_oak`/`deepslate`, exposed rafters | jettied upper floor, diagonal braces, brick chimney + smoke, outbuilding |
| **Medieval stone town house** | `stone_bricks` (+mossy/cracked) + `*_log` quoins | steep `dark_oak`, tower roof | tower focal, arched windows, balcony box, plaza + pond, retaining walls |
| **Grand symmetric mansion** | `dark_oak`/`spruce` + `*_log` pilasters | `dark_oak` hip/gable, rows of dormers | central pediment entrance, columns, symmetric wings, formal parterre garden |
| **Gothic / Victorian manor** | `spruce`/`dark_oak` + plaster + `deepslate` | very steep spire/mansard, ridge **cresting** | tall narrow red `stained_glass`, ivy, spiky finials, multi-flue chimneys, iron-bar rails |
| **Rustic log cabin / lodge** | `spruce`/`stripped_*_log` walls | `spruce_stairs`, multi-gable | log-post verandas, balconies with flower boxes, dormers, stone path |
| **A-frame / glass gable** | `spruce` frame + big `glass` gable wall | one tall steep A-frame | full-height glazed gable, balconies with stone balustrade, deep deck |

---

## Mansion-scale massing (don't just scale a cottage up)

A mansion is **several masses composed**, not one big box:

- **Central block + flanking wings:** a taller central mass (with the grand entrance/pediment) and
  symmetric lower wings left and right — the formal-mansion footprint. Each wing gets its own roof.
- **Multi-gable / cross-plan:** an L, T, or H footprint; gables face front at the ends; roofs meet
  at valleys (the cottagecore-manor reference).
- **Vary heights:** 2-storey wings, a 3-storey centre, a 4-storey tower — the stepped skyline is
  what reads as "estate".
- **Repeat the bay rhythm:** windows, dormers, and pilasters on a strict grid across the long
  facade; symmetry at the *scale of the facade* with an irregular overall silhouette.
- Break a long roof with dormers + multiple chimneys so it doesn't read as a warehouse.

---

## Grounds & formal landscaping (a mansion needs an estate)

The references with the biggest "wow" are 60% **grounds**. Don't leave a build on bare grass:

- **Terracing:** step the site with `stone_brick`/`*_wall` **retaining walls** into garden beds at
  different levels (the terraced manor references).
- **Formal parterre:** symmetric hedge (`*_leaves`/`azalea_leaves`) beds framing flower plots, a
  **central feature** (a flower bed, fountain, or statue) on the entry axis (the symmetric-mansion
  garden).
- **Flower beds:** mass `flower`s by color in `*_leaves`/grass borders; window boxes and planters
  (`*_trapdoor`/`composter`/`decorated_pot` + flowers).
- **Paths:** `stone_brick`/`*_slab`/`gravel`/`dirt_path` walkways on the entry axis, branching to
  wings and the garden; edge them with `*_fence`/low hedge/**lamp posts** (`*_fence` column +
  `lantern`, or `*_wall` + `lantern`, or `chain`+`lantern`).
- **Outbuildings:** a **greenhouse** (`glass` + `*_log` frame), a well, a small barn/shed, a gazebo
  — context turns a house into a place (the manor references).
- **Water & nature:** a `water` pond edged with `*_slab`/`*_stairs` and `lily_pad`, scattered trees
  (`*_log`+`*_leaves`), `moss_block`/`grass` ground cover.

---

## Exterior audit (catch in the preview — [`07`](07-workflow.md))

- ❌ One material top to bottom → ✅ stone base + timber/plaster body + dark roof.
- ❌ Flat wall plane → ✅ framing, infill, string course, quoins, ivy, base plinth.
- ❌ Thin shallow roof of wall material → ✅ steep, dark, contrasting, **deep overhang**, exposed
  rafters, ridge cap/cresting.
- ❌ Big single roof on a big build → ✅ multi-gable/wings with valleys + dormers.
- ❌ Door is a bare hole → ✅ recessed/projecting framed entrance, steps, lights; pediment/porch at
  mansion scale.
- ❌ Symmetric featureless box → ✅ wings, a tower or tall central bay, varied heights, distinct front.
- ❌ Build sits on flat grass → ✅ plinth, terraces, parterre garden, paths, lamp posts, outbuildings.
- ❌ Mansion = a cottage scaled up → ✅ composed masses (centre + wings), bay rhythm, stepped skyline.
- ❌ Balcony/porch with no support or no door onto it → ✅ posts/corbels under it, a door behind it.
