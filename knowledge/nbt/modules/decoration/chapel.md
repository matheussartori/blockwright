# Decoration module — Chapel

> Module guide for the **chapel** decoration. It loads into the system prompt only when
> the chapel decoration is selected. A decoration is the *look* layered over any structure
> type: it sets the material palette and guides interior dressing. Select it on a
> `template` op with `params.decoration: 'chapel'` (the default for the church), or just
> build with this palette by hand. It is UNIVERSAL — it composes with any structure.

## The chapel palette (what the decoration maps roles to)

| Role | Block | Notes |
|------|-------|-------|
| wall | `smooth_quartz` | bright whitewashed-plaster primary surface |
| floor | `stone_bricks` | dressed-stone nave floor / aisle |
| ceiling | `smooth_quartz` | white plaster vaulting |
| foundation | `stone_bricks` | dressed-stone footing / plinth |
| corner / pillar | `stone_bricks` | stone quoins + buttress piers against the white wall |
| accent | `chiseled_stone_bricks` | window frames, lintels, belt courses |
| trim | `stone_brick_slab` | sills, cornices, step-ledges |
| beam | `polished_deepslate` | dark stone string courses / ridge framing |
| roof | `deepslate_tile_stairs` | steep DARK roof (the chapel's silhouette) |
| window | `glass_pane` · glass `glass` | tall leaded windows |
| door | `dark_oak_door` | heavy timber portal |
| fence | `dark_oak_fence` | rails, cross arms |
| light | `lantern` | warm light along the nave + on the steeple |

Keep to this family: **bright white plaster** (smooth quartz, calcite, diorite) for the
walls, **dressed stone bricks** for every frame/buttress/quoin, and a **dark deepslate**
roof. Stained glass (red/blue/white) suits the tall windows; gold/yellow accents (gilded
blackstone, sea lanterns) and dark-oak woodwork read as sacred.

## Chapel intent (apply throughout)

- **White over stone.** The shell is white plaster framed by grey stone — keep added
  surfaces in that contrast. Use stone for every buttress, quoin and window surround so the
  white walls read as panels between a stone skeleton, never a flat box.
- **Tall, vertical, light.** Long leaded windows reaching most of the wall height, lit from
  inside; a steep dark roof; a steeple/spire topped by a cross. Verticality is the mood.
- **Sacred interior.** A long central aisle of pews (stairs/slabs facing the altar), a
  raised altar at the far end (a lectern, candles/lanterns, gold trim, a banner), an organ
  or font, chandeliers (lanterns on chains) down the nave. Keep it open and symmetric.
- **Intact by default** (a kept chapel). For a RUINED/abandoned look the structure's decay
  turns stone to its mossy/cracked variants and adds cobwebs/vines — only when decay is on.
