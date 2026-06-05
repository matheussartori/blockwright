# Roof module — Hip

> Module guide for the **hip** roof typology. It loads into the system prompt **only
> when the user picks the Hip roof** (or a structure that selects it), so an unused roof
> guide never costs tokens. There is NO roof template — you build the roof yourself with
> ordinary ops, on top of `05-building-houses.md` and the `roof` op.

## What a hip roof is

All **four** walls are topped by a slope, meeting at a short central **ridge** (or a
single point on a square plan). There are **no vertical gable ends** — every side slopes.
It reads as more solid and formal than a gable, and wraps an even eave on all four sides.

## How to build it

1. **One roof only.** Emit a single `roof` op with `style: 'hip'` over the wall box:
   `{ op: 'roof', from: [x0, wallTop+1, z0], to: [x1, y1, z1], state: <stairs>, style: 'hip', fill: <wall> }`.
   Never two roofs, never a flat lid.
2. **Even overhang on all four sides.** A hip's whole point is the wrap-around eave —
   overhang **1 block on every side** and run a continuous fascia course beneath it.
3. **Ridge length.** On a rectangular plan the ridge runs along the longer axis and is
   shorter than the footprint; on a square plan it collapses to a point (a pyramidal hip).
4. **Corners.** The hip rafters fall to each corner — keep them clean; don't leave a
   stray gable triangle (that would make it a half-hip by accident).
5. **Attic / dormers.** An attic still lives inside the one hip void. If you want light,
   add small **dormers** (a tiny gabled box poking through a slope) rather than a gable end.

## Avoid

- Mixing in a vertical gable wall (that's the gable roof, not a hip).
- Uneven or missing overhang on one side — the eave must wrap evenly.
- A second roof or a flat cap on a house.
