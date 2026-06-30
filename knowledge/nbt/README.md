# Blockwright NBT Generation Knowledge Base

> Practical guide for an AI agent (Claude / Codex / any coding agent) to **generate and
> edit Minecraft `.nbt` structure files** — houses, builds, interiors, decoration — that
> render correctly in Blockwright.

This folder is the agent's "training". When the app asks for an NBT (e.g. *"build me a
small oak cottage with a furnished interior"*), the agent reads these files first, then
produces the structure. **Target version: Minecraft Java 1.21.1 only** (DataVersion
`3955`). Other versions come later.

## How the app uses this

File ▸ New Structure opens a chat that generates `.nbt`s. The flow:

1. User types a prompt, and optionally attaches **reference `.nbt` files** / **reference
   images** and a structured "[Build details]" brief (structure type + decoration + roof +
   basement + size/floors…) — plain-language guidance, not a stamped preset shell.
2. The app runs the chosen AI provider with these guides as the system prompt (situational
   ones — e.g. the tower playbook — are dropped unless the prompt calls for them, to save tokens).
3. The model emits a structure in the **authoring format** (see below) via the `emit_structure`
   tool, describing geometry with **volumetric `ops`** and **`template`s** rather than thousands
   of per-block entries.
4. The app **validates + compiles** that JSON → a real gzipped `.nbt` (running the
   post-processing passes / placement backstop), and **renders it live in the 3D viewer**.
5. The compiled build is **screenshotted from several angles and fed back to the model**, which
   critiques it against the prompt and **re-emits an improved version** — an emit → render →
   review → refine loop walked through ordered design passes (massing → roof → facade → interior
   → circulation → audit), not one shot. See [`07-workflow.md`](07-workflow.md).

The model never edits binary NBT by hand. It writes a plain, reviewable intermediate; the app
owns the binary encoding (correct tag types, gzip, DataVersion) and a set of safety-net passes.

## Authoring format (decision)

**The agent emits JSON**, not binary NBT and not SNBT. Reasons: LLMs are reliable at JSON,
it maps 1:1 onto the NBT tag tree, and it's diffable for edits. The app compiles that JSON to a
gzipped `.nbt` with the correct NBT tag *types* (NBT distinguishes `int` / `double` / `byte` /
`string` / typed lists — JSON does not, so the compiler applies the type rules documented in
[`01-nbt-format.md`](01-nbt-format.md)). All examples in these guides are written in this JSON
authoring format.

> The model emits **`ops`/`template`** for geometry and reserves the flat `blocks` list for
> tiny builds and block-entity detail — see [`00-volumetric-ops.md`](00-volumetric-ops.md) and
> [`13-templates.md`](13-templates.md). After compiling, the app runs post-processing passes
> that fix common placement slips (floating lights, unsupported wall fixtures, fence/pane
> connections, stairwell headroom). Treat the backstop as a net, not a license — a build that
> needs no fixes renders right the first time and costs fewer review rounds.

## Reading order

| File | What it covers |
|------|----------------|
| [`00-volumetric-ops.md`](00-volumetric-ops.md) | **Start here for geometry.** The volumetric build ops (`fill`/`hollow`/`walls`/`line`/`block` + `mirror`/`rotate`/`repeat`/`roof`/`stairs`) — emit these, not per-block lists. |
| [`01-nbt-format.md`](01-nbt-format.md) | The structure `.nbt` tag tree, types, and the JSON authoring schema. |
| [`02-coordinates-and-layout.md`](02-coordinates-and-layout.md) | Coordinate system, `size`, origin, orientation, rotations. |
| [`03-blocks-and-blockstates.md`](03-blocks-and-blockstates.md) | Common building blocks and their blockstate properties. |
| [`04-block-entities.md`](04-block-entities.md) | Chests, signs, barrels, furnaces, item frames — block-entity NBT. |
| [`05-building-houses.md`](05-building-houses.md) | Foundations, walls, roofs, windows, doors — construction recipes. |
| [`06-decoration-and-interiors.md`](06-decoration-and-interiors.md) | Faux-furniture, lighting, kitchens, bedrooms, storage, gardens. |
| [`07-workflow.md`](07-workflow.md) | Generate → preview → validate → iterate; using references & images. |
| [`08-complex-structures.md`](08-complex-structures.md) | Render-fidelity table, large/modular builds, vertical zoning (basement/floors/attic), mixed footprints, multi-room underground complexes, deep reference-NBT & image workflow, advanced gotchas. |
| [`09-worked-example.md`](09-worked-example.md) | One complete annotated cabin in the authoring JSON — copy as a template. |
| [`10-design-principles.md`](10-design-principles.md) | What makes a build look *good*: palette, depth, roof typology, entrances, windows, rooms, landscaping. |
| [`11-furniture-and-interior-detailing.md`](11-furniture-and-interior-detailing.md) | Block-by-block furniture grammar: stair+trapdoor sofas, tables, fireplaces, chandeliers, rugs, wall/ceiling detailing. |
| [`12-exterior-and-facade-detailing.md`](12-exterior-and-facade-detailing.md) | Block-by-block facade grammar & style archetypes: timber framing, dormers, balconies, porches, towers, chimneys, mansion massing & grounds. |
| [`13-templates.md`](13-templates.md) | The `template` op: stand up a whole shell from a structure type (`house`/`tower`) × decoration (`cozy`), then layer your own ops on top. |
| [`14-furnishing-by-space.md`](14-furnishing-by-space.md) | Match furnishing density to floor space: the snug/standard/grand tiers, room presets as a decoration-agnostic base, and how the `[Room plan]` brief drives it — so a big room never reads empty. |

### Module guides (loaded only when selected / relevant)

The generation domain is **modular**: structures, decorations, roofs and basements are
separate modules, each with its own guide under `modules/`. Only the selected module's
guide rides in the system prompt (or one pulled in by a matching prompt keyword), so the
core stays small — and a roof/basement guide loads **only when that exact type is picked**,
never speculatively. Categories:

| File | Category | What it covers |
|------|----------|----------------|
| [`modules/structure/cottage.md`](modules/structure/cottage.md) | structure | The `cottage` house type: design it yourself (no template) + a house refinement checklist. |
| [`modules/structure/keep.md`](modules/structure/keep.md) | structure | The `keep` tower type: base→shaft→crown massing, exterior detailing, crowns, furnished floors, lighting. |
| [`modules/decoration/cozy.md`](modules/decoration/cozy.md) | decoration | The `cozy` look: warm palette, lighting, soft furnishings, hearth, plants. |
| [`modules/roof/gable.md`](modules/roof/gable.md) | roof | The `gable` roof: two slopes + a triangular gable end, ridge axis, overhang/fascia, attic void. |
| [`modules/roof/hip.md`](modules/roof/hip.md) | roof | The `hip` roof: four sloped sides, wrap-around eave, dormers for light, no gable ends. |
| [`modules/basement/cellar.md`](modules/basement/cellar.md) | basement | The `cellar` undercroft: sealed stone shell + lit pillars; furnish as storage/workshop/wine cellar. |
| [`modules/basement/crypt.md`](modules/basement/crypt.md) | basement | The `crypt` burial vault: processional aisle, catacomb columns, bone niches, soul-lit. |
| [`modules/basement/cult-temple.md`](modules/basement/cult-temple.md) | basement | The `cult-temple` sunken sanctum: altar focus, ritual circle, dark ceremonial dressing. |
| [`modules/room/living.md`](modules/room/living.md) | room | The `living` room: hearth focal point, seating cluster, rug, dressing, warm light. |
| [`modules/room/kitchen.md`](modules/room/kitchen.md) | room | The `kitchen`: counter run, cooktop/oven, sink, storage, a small dining nook. |
| [`modules/room/library.md`](modules/room/library.md) | room | The `library`: book-lined walls, central study table, reading chair, chandelier. |
| [`modules/room/bedroom.md`](modules/room/bedroom.md) | room | The `bedroom`: one made bed, nightstands, wardrobe, rug, curtained window. |
| [`modules/room/dormitory.md`](modules/room/dormitory.md) | room | The `dormitory` (shared bedrooms): rows of beds with partitions, shared wardrobe, windows. |
| [`modules/room/storage.md`](modules/room/storage.md) | room | The `storage` room: walls of barrels/chests, shelving, sacks/crates, one working lantern. |

> Picking a roof/basement briefs the model in plain language and loads its guide. The modules
> also carry their own code geometry (a generic `build()` + optional host-specific extras), used
> for the gallery preview — but in normal generation **you (the model) still build the roof/basement
> yourself** following the guide; the code geometry isn't stamped into your output. Each module
> declares `appliesTo` (the structures it pairs with, `['house']` for now) — a growing link that
> filters the picker and gates which guide loads, and lets a roof/basement be reused on future
> structure types.

> **Room** modules are *guidance-only* (no code geometry). The user assigns up to two rooms to
> each floor of a storeyed structure (the house); each assigned room loads its guide and rides into
> the prompt as a `[Room plan]` line per floor. You furnish each storey's interior yourself from
> those guides, partitioning a floor that holds two rooms into real, separated spaces. Each room
> ships **furnishing presets** tiered by floor space (snug / standard / grand) — a decoration-agnostic
> base layout the `[Room plan]` line picks by the room's computed area and asks you to re-skin in the
> chosen decoration, so a large room is furnished to its size, not left empty (see
> [`14-furnishing-by-space.md`](14-furnishing-by-space.md)).

## Hard rules (read before generating)

- **Version is 1.21.1.** Use only block IDs and blockstate properties that exist in 1.21.1.
  Always set `DataVersion: 3955`.
- **All block IDs are namespaced** (`minecraft:oak_planks`). Default namespace is `minecraft`.
- **Positions are 0-indexed**, relative to the structure's most-negative corner, and must be
  `0 <= pos < size` on each axis (see [`02`](02-coordinates-and-layout.md)).
- **The first palette entry by convention is `minecraft:air`**, but air blocks may simply be
  omitted from `blocks` — empty space needs no entry. Prefer omitting air to keep files small.
- **Describe geometry with `ops`, not a giant `blocks` list** ([`00`](00-volumetric-ops.md)), and
  stand up shells with the `template` op ([`13`](13-templates.md)). Output tokens are the dominant
  cost; one `fill` is a whole wall. Reserve flat `blocks` for tiny builds and block-entity detail.
- **Blockstate property values are always strings in NBT** (`"true"`, `"north"`, `"8"`),
  even when they look numeric/boolean.
- When unsure whether a block or property exists, prefer a simpler, known-good block over an
  invented one. A wrong block ID renders as a fallback color, which is a visible failure in
  the preview.
- **The preview validates geometry, not data.** Items in containers, sign/banner text &
  patterns, and `entities` (item frames, paintings, mobs) do **not** appear — see the fidelity
  table in [`08`](08-complex-structures.md). Build interiors from block *geometry* (faux-furniture).
- **Never renumber palette indices** once `blocks` reference them — append new states only, and
  don't mutate a shared entry to change a subset of blocks ([`08`](08-complex-structures.md)).
- **Validity isn't the bar — looking intentional is.** A correct hollow single-material cube is a
  bad build. Apply the design principles in [`10`](10-design-principles.md): 3–5 cohesive
  materials, surface depth, a pitched/edged roof with an overhang, a framed entrance, and a
  grounded base. Don't ship a flat one-block box.
