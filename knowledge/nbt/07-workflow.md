# 07 — Workflow: generate → preview → validate → iterate

Blockwright renders a **live 3D preview** of the NBT. That preview is the agent's feedback
loop — treat generation as iterative, not one-shot. This file describes the loop and how to
use **reference NBTs** and **reference images**.

## The loop

1. **Understand the request.** Extract: build type, size/footprint, style/materials, must-have
   features (rooms, furniture, color), and any orientation. If references are attached, read
   them first (below).
2. **Plan in layers.** Decide `size`, the material palette, and a rough top-down + side
   sketch ([`02`](02-coordinates-and-layout.md), [`05`](05-building-houses.md)).
3. **Generate** the JSON ([`01`](01-nbt-format.md)): palette, then `blocks` layer by layer,
   then block entities and decoration.
4. **Self-check** against the checklist in [`01`](01-nbt-format.md) §"Sanity checks" before
   handing off (state indices in range, positions in bounds, IDs valid, properties stringy).
5. **Preview.** The app compiles JSON→`.nbt` and renders it. Inspect:
   - Does the silhouette match the intent (right size, roof shape, openings)?
   - Any **flat untextured blocks**? → a wrong/unknown block ID fell back to a solid color. Fix the ID.
   - Any **floating** blocks, holes in walls/roof, doors/stairs facing wrong?
   - Block count / dimensions sane for the request?
6. **Iterate.** Make targeted edits (the JSON is diffable) and re-preview. Repeat until it
   matches. Don't regenerate from scratch for small fixes — patch the cells involved.

## Validating from the preview (what to look for)

| Symptom in preview | Likely cause | Fix |
|--------------------|--------------|-----|
| Flat solid-color block | Unknown block ID (fallback color) | Correct the ID ([`03`](03-blocks-and-blockstates.md)) |
| Stair/door points wrong way | Wrong `facing` | Flip `facing` to intended direction |
| Block in mid-air | Missing support / wrong `pos` | Add support or fix coordinates |
| Gap in wall/roof | Missed cell in the layer loop | Fill the cell |
| Build off-center / oversized box | `size` padded or origin wrong | Tighten `size` ([`02`](02-coordinates-and-layout.md)) |
| Door/window misaligned by 1 | Off-by-one in the perimeter test | Recheck `x==0||x==W-1||…` bounds |
| Two materials clash | Palette too busy | Reduce to 2–3 materials |

Because the preview doesn't show item-frame/sign **contents** (nor banner patterns or
`entities`), validate *layout and geometry* visually and trust the contents to the data checks.
For the exact list of what does and doesn't render, see the **fidelity table** in
[`08-complex-structures.md`](08-complex-structures.md) — and note that Blockwright *does* render
chest, bed, wall-banner, and water/lava geometry specially.

## Using reference `.nbt` files

When the user attaches reference structures, they are showing you **what to imitate or build
on top of**. The app can parse them into the same JSON shape (or you can read the rendered
result). Use them to:

- **Extract the palette/material theme** — reuse the same block IDs so your build matches.
- **Match proportions** — read the reference `size` and keep your dimensions in the same range.
- **Copy patterns** — lift a roof technique, a window rhythm, a furniture recipe and adapt it.
- **Extend/modify** — if asked to "add a second floor to this", load the reference as the base,
  keep its blocks, and append new layers above (bump `size.y`, reuse palette indices, add the
  new cells). Preserve the original's coordinates so the join lines up.

When building *on top of* a reference, don't silently change its existing blocks unless the
request implies it; add/modify the parts the user asked for and keep the rest intact.

## Using reference images

Images convey **style, shape, color, and vibe** — translate them into Minecraft blocks:

- **Roof shape** → gable / hip / flat ([`05`](05-building-houses.md)).
- **Wall color/material** → closest block (e.g. white plaster → `white_terracotta`/`white_concrete`;
  dark timber → `dark_oak_log`/`spruce`; red brick → `bricks`).
- **Window layout** → where to place `glass_pane` openings and their rhythm.
- **Proportions** → estimate footprint and height in blocks from the image.
- **Mood** → choose lighting and decoration style ([`06`](06-decoration-and-interiors.md)).

You can't pixel-match a photo; aim for a faithful **blocky interpretation**: capture the
silhouette, the 2–3 dominant materials, and the standout features. Note the mapping choices
you made so the user can correct them.

## Handling edits / follow-up prompts

Treat the current structure as state. For *"make the roof red"*, *"add a fireplace"*, *"make
it bigger"*:

- Identify exactly which cells/palette entries change.
- Add palette entries as needed (don't mutate an entry that other blocks share).
- Re-run the sanity checks (a bigger build means new `size` and possibly out-of-bounds risk).
- Re-preview and confirm only the intended thing changed.

## What to return alongside the NBT

A short note helps the user and future edits:

- The chosen **size**, **front orientation**, and **material palette**.
- A one-line description of each room / notable feature.
- Any **assumptions or interpretation choices** (especially from image references).
- Anything that couldn't be done in 1.21.1 and what you substituted.
