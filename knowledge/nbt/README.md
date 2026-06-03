# Blockwright NBT Generation Knowledge Base

> Practical guide for an AI agent (Claude / Codex / any coding agent) to **generate and
> edit Minecraft `.nbt` structure files** — houses, builds, interiors, decoration — that
> render correctly in Blockwright.

This folder is the agent's "training". When the app asks for an NBT (e.g. *"build me a
small oak cottage with a furnished interior"*), the agent reads these files first, then
produces the structure. **Target version: Minecraft Java 1.21.1 only** (DataVersion
`3955`). Other versions come later.

## How the app uses this

The flow Blockwright is being built toward:

1. User opens a generation panel, types a prompt, and optionally attaches **reference
   `.nbt` files** and/or **reference images**.
2. The app spawns an agent with this folder available as context.
3. The agent reads the relevant guides here, then emits a structure in the **authoring
   format** (see below).
4. The app compiles the authoring format → a real gzipped `.nbt` and **renders a live 3D
   preview**.
5. The agent inspects the preview / structure stats, validates against the request, and
   iterates. This loop is the core feature — see [`07-workflow.md`](07-workflow.md).

The agent is never editing binary NBT by hand. It writes a plain, reviewable
intermediate; the app owns the binary encoding (correct tag types, gzip, DataVersion).

## Authoring format (decision)

**The agent emits JSON**, not binary NBT and not SNBT. Reasons: LLMs are reliable at JSON,
it maps 1:1 onto the NBT tag tree, and it's diffable for edits. The app is responsible for
compiling that JSON to a gzipped `.nbt` with the correct NBT tag *types* (NBT distinguishes
`int` / `double` / `byte` / `string` / typed lists — JSON does not, so the compiler applies
the type rules documented in [`01-nbt-format.md`](01-nbt-format.md)).

> Status: the JSON→NBT compiler in the app is **not built yet**. These guides define the
> contract it must satisfy. SNBT examples are included for reference because Minecraft's own
> structure-block UI and `/data` use SNBT, and reference files are easiest to discuss in it.

## Reading order

| File | What it covers |
|------|----------------|
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
| [`14-towers.md`](14-towers.md) | Standalone towers: base→shaft→crown massing, vertical emphasis, tier/machicolation rings, crowns (spire/parapet/horns), tower lighting, dark-fantasy palettes & archetypes. |

## Hard rules (read before generating)

- **Version is 1.21.1.** Use only block IDs and blockstate properties that exist in 1.21.1.
  Always set `DataVersion: 3955`.
- **All block IDs are namespaced** (`minecraft:oak_planks`). Default namespace is `minecraft`.
- **Positions are 0-indexed**, relative to the structure's most-negative corner, and must be
  `0 <= pos < size` on each axis (see [`02`](02-coordinates-and-layout.md)).
- **The first palette entry by convention is `minecraft:air`**, but air blocks may simply be
  omitted from `blocks` — empty space needs no entry. Prefer omitting air to keep files small.
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
