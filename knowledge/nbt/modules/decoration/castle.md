# Decoration module — Castle

> Module guide for the **castle** decoration. It loads into the system prompt only when
> the castle decoration is selected. A decoration is the *look* layered over any structure
> type: it sets the material palette and guides interior dressing. Select it on a
> `template` op with `params.decoration: 'castle'` (the default for the keep), or just
> build with this palette by hand. It is UNIVERSAL — it composes with any structure.

## The castle palette (what the decoration maps roles to)

| Role | Block | Notes |
|------|-------|-------|
| wall | `stone_bricks` | light grey dressed-stone primary surface |
| floor | `spruce_planks` | dark timber underfoot / decking |
| ceiling | `stone_bricks` | stone vaulting / the roof deck |
| foundation | `cobblestone` | heavier rough-stone footing / plinth |
| corner / pillar | `stone_bricks` | masonry, not timber framing |
| accent | `chiseled_stone_bricks` | quoins, lintels, string courses |
| trim | `stone_brick_slab` | sills, cornices, parapet caps |
| beam | `spruce_log` | exposed dark timber (floors, lintels) |
| roof | `stone_brick_stairs` | the interior stair core's steps |
| window | `glass_pane` · glass `glass` | narrow arrow-slit glazing |
| door | `spruce_door` | heavy dark timber |
| fence | `spruce_fence` | rails, railings |
| light | `lantern` | warm light on landings + sconces |

Keep to this family: stone bricks, cobblestone, chiselled/polished stone, andesite,
deepslate accents, with **dark spruce or dark-oak woodwork** for doors, beams, and
furniture. Iron (bars, chains, anvils) and wool/banners for heraldry suit it.

## Castle intent (apply throughout)

- **Masonry first.** The shell is stone — keep added surfaces stone too. Use timber only
  for floors, beams, doors, furniture, and roof framing, never for the outer walls.
- **Heraldry + iron.** Banners flanking the entrance and on interior walls, iron bars over
  cellar/arrow openings, chains hanging lanterns, an anvil or grindstone in a workshop.
- **Defensive, lived-in mood.** A guard room or armoury at the base (weapon racks, barrels,
  a table), a study or bedchamber above (desk, bookshelves, bed), a brazier or campfire on
  the roof deck behind the merlons. Light every level — lanterns on landings, sconces by
  doors.
- **Intact by default** (a kept keep). For a RUINED look the structure's decay turns stone
  to its mossy/cracked variants and adds cobwebs/vines — only when decay is on.
