# Structure module — Towers & vertical focal points (standalone)

> Module guide for the **tower** structure type. It loads into the system prompt only
> when a tower is selected (or the prompt asks for one). The composer can stand up a
> tower shell with `{ op: 'template', name: 'tower', params: { crown, decoration } }`
> (`crown` = `parapet` | `spire` | `flat`), then layer your own ops on top. The
> `template` already emits a battered base, an inset shaft with corner quoins, per-storey
> string-course rings and window slits, bracket lanterns, and the chosen crown — your job
> is to refine and furnish it, not rebuild the shell.

`05-building-houses.md` builds a house shell and `12-exterior-and-facade-detailing.md`
treats a tower as *one feature of a bigger house*. This file is about the **tower as the whole
build** — a tall vertical structure that has to read as deliberate from the ground to the crown:
wizard spire, watchtower, dark-fantasy keep, lighthouse, Barad-dûr / Eye-of-Sauron style horned
tower. It's the vertical twin of [`12`](12-exterior-and-facade-detailing.md).

The through-line of every good tower: **a grounded flared base, a shaft with strong vertical
emphasis broken into tiers, and a dramatic crown** — plus lighting that defines the silhouette at
night. A constant-width extruded column with a flat top is the failure mode; almost everything
below fights that.

> **The two basic-tower failures to refuse outright** (these are what a lazy emit produces — do NOT
> ship either):
> 1. **A stack of identical boxes.** Plain rectangular storeys piled up, each a flat stone-brick box
>    with a wood frame and a square window, abrupt equal setbacks, and a broken/jagged top. This is
>    NOT a tower — it's stacked crates. A real tower TAPERS and has continuous vertical detail running
>    *through* the storey divisions (ribs, buttresses), not a hard seam between boxes.
> 2. **A featureless monolith.** A single uniform-width column, same cross-section top to bottom, a
>    flat top, tiny scattered windows, no base, no crown. A "tower" with no base flare and no crown is
>    half-built.
>
> **Be ambitious and varied — towers are the build where creativity matters most.** Don't default to a
> grey square keep every time. Pick a distinct ARCHETYPE (see the table) and lean into it: a slender
> fairy-tale mage spire with projecting balconies, bay windows, hanging bracket-lanterns, cascading
> ivy and a tall candy-coloured conical roof; a round medieval watchtower with a timber hoarding and a
> flag; a gothic needle-spire; a verdigris-copper-roofed wizard tower with satellite turrets; a
> warm brick clock-tower with a gabled spire and cottages clustered at its foot; a buttressed
> deepslate fortress with machicolations. **Break the outline** — a tower whose silhouette is pure
> rectangle is the boring one. Vary the SHAPE (round/octagon/tapered, not just square), the CROWN
> (spire/horns/battlement/belfry — never a flat lid), the BASE (flared/buttressed/on rock, never a
> pole on grass), and the DECORATION (balconies, vines, banners, bracket lanterns, glowing windows).

> **Cost note ([`00`](00-volumetric-ops.md)):** a tower is mostly one tall shell. Build it with
> `walls`/`hollow` for the shaft, `repeat` to stamp tier rings and window bays up the height, and
> `rotate` ×3 to turn one corner buttress/horn into four. Never `fill` the shaft solid — it has an
> interior (the stair/ladder core). One `hollow` per shaft segment.

---

## Massing: the three-part silhouette

A tower lives or dies on its **silhouette**. Compose it as **base → shaft → crown**, each visibly
distinct, and **taper or step** at least once so it isn't a pure extrusion:

- **Base (flared / battered):** the bottom 3–6 courses widen outward — a `batter` (each course
  steps out 1 block as it descends), or splayed **buttress fins** at the corners (Barad-dûr,
  image 2/3), or a stepped masonry plinth on rock/an island (image 1). The base should look like it
  *carries* the tower's weight. Ground it: a stepped foundation, an outcrop of `stone`/`deepslate`/
  `cobbled_deepslate`, an island edged in the water — never a clean pole meeting flat grass.
- **Shaft:** the tall body. Give it **vertical emphasis** (pilaster ribs, engaged columns, vertical
  seams — see below) and break it into **2–4 tiers** with overhanging rings/setbacks so the eye has
  stops. A tall tower may also **taper** (step inward ~1 block every tier) like images 3–4.
- **Crown:** the payoff — a parapet, a spire, or a cluster of horns/finials (see Crowns). Most
  builds put the **focal element** (feature window, beacon, the "eye") here. The crown should be
  wider or busier than the shaft top so the tower doesn't just stop.

```
Profile (one face), base flares, shaft tiers, crown crowns:

      /\  /\        ← horns / finials (crown)
     |====|         ← parapet / machicolation ring
     | [] |         ← feature window (focal)
     |    |
    [|====|]        ← tier ring (overhang setback)
    |      |
    |  []  |
   [|======|]       ← tier ring
   |        |
  /|        |\      ← buttress fins begin
 / |        | \
/__|========|__\    ← flared / battered base on rock
```

**Footprint shape:** square is fine but **octagonal or round reads more "tower"** (the watchtower,
image 4). Approximate a circle/octagon by chamfering the corners — cut the corner cells and step
them with `*_stairs`/`*_slab` so the plan isn't a hard square. For a round tower, build one octant
and `rotate`/`mirror` it for symmetry.

---

## Vertical emphasis — the signature tower move

A tower must read as **tall**, so the surface detailing runs **up**, not across. This is the single
biggest difference between a tower and a tall house:

- **Pilaster ribs / engaged columns:** run a 1-wide vertical rib of a contrasting block up the full
  height at each corner and every ~3–5 blocks around the shaft (`polished_basalt` is ideal — its
  texture is vertically banded; also `*_log axis:y`, `chiseled_*`, `deepslate_brick_wall` columns,
  `iron_bars`). The ribs cast continuous vertical shadow lines (clearest in image 1's dark tower).
- **Recessed bays between ribs:** the wall panel between two ribs sits **1 block back**, often in a
  different/patterned block (`chiseled_deepslate`, `cracked_*`, `*_tiles`) — the rib/recess rhythm
  is what makes the dark towers look carved rather than poured.
- **Vertical seams:** even on a smooth tower (image 3), drop a 1-wide column of a darker block at
  intervals so the cylinder isn't a flat texture.
- **Ladders & chains as texture:** an exterior `ladder` run or hanging `chain` columns (image 1)
  double as vertical lines *and* read as "this is climbable/lived-in".
- Keep **horizontal** elements rare and deliberate — only the tier rings and a string course. Too
  many horizontal bands make a tower read short.

---

## Tiers, setbacks & machicolation rings

Breaking the shaft into tiers is what separates a tower from a chimney. At each tier division:

- **Overhanging corbel ring (machicolation):** project a ring of `*_stairs half:top` / `*_slab` /
  `*_wall` out 1 block all the way around, optionally with a row of `*_trapdoor` or downward
  `pointed_dripstone` "teeth" under the overhang. This is the medieval machicolation (image 4's
  mid-tower ring) and the structural ledge the dark towers hang their lanterns and platforms off
  (image 1). Stamp it with one `repeat` per side, or build one side and `rotate` ×3.
- **Setback:** above the ring the next shaft segment steps **inward** 1 block, so the tower visibly
  narrows as it climbs (images 3–4). The overhang + setback together make a strong shadow notch.
- **Projecting platforms / bartizans:** at one or more tiers, cantilever a small **balcony or
  turret box** (a bartizan) off one face — `*_slab` floor on `*_stairs half:top` corbels, railed
  with `*_fence`/`iron_bars`/`*_wall`, roofed with a tiny spire or slab cap (the wooden lookout box
  in image 4). Give it a window/door from the shaft behind so it's reachable.
- Space tiers **unevenly** — a taller lower shaft, shorter upper stages — for a tapering, telescoping
  look, rather than equal slices.

---

## Break the outline — projecting & organic detail (what makes towers *interesting*)

A boxy tower stays boxy until things **stick out of it**. The reference towers are covered in
projections; add several, at different heights and faces (asymmetry is good — don't mirror everything):

- **Balconies & galleries:** cantilever a `*_slab` floor on `*_stairs half:top` corbels off a face,
  railed with `*_fence`/`iron_bars`/`*_wall`, reached by a door from the shaft. A wrap-around gallery
  just under the crown (the lighthouse/observation deck) is a strong move.
- **Bay / oriel windows:** push a 1-block bump-out with a tall window on one or two storeys (the mage
  spire) — a small `walls` box projecting from the shaft, glazed and lit, capped with a `*_slab` or a
  tiny pitched roof.
- **Bracket-arm hanging lanterns:** a `*_fence`/`*_wall`/`*_trapdoor` arm sticking out from the wall
  with a `chain`→`lantern[hanging:true]` (or a `*_hanging_sign`) dangling from it — the wrought-iron
  lamp bracket seen on the fairy-tale towers. Far better than a lantern stuck flat to the wall.
- **Bartizans / corner turrets:** small roofed turret boxes corbelled off the corners (see Tiers),
  each with its own little spire — a cluster of satellite turrets around a central trunk (the
  copper-roof and aurora towers) reads as fantastical.
- **Timber hoarding / overhanging top floor:** a wider wooden top storey oversailing the stone shaft
  on visible beam corbels (`*_log`/`*_stairs`), often open-sided — the medieval watchtower cap.
- **Vines & moss:** drape `vine`/`glow_lichen`/`cave_vines` down the stone and over the eaves, and
  noise the field with `mossy_`/`cracked_` — the references are softened by greenery, never bare clean
  stone. (Vines attach to a block face; hang them off overhangs and walls, in air, not in the wall.)
- **A real entrance:** the base gets an **arched doorway** (step `*_stairs half:top` to a keystone)
  framed by pillars/quoins, often reached by a **wide flight of steps with railings** (use the
  `stairs` op) — see the keep and clock-tower refs. Not a 1×2 hole in a flat wall.
- **Attached annexes / twin towers:** cluster small outbuildings (a cottage, a guardhouse, a well) at
  the foot, or pair two towers joined by an arch/bridge — turns a lone pole into a *place*.
- **A flag / banner** on the crown (a `*_banner` on a `*_fence` mast) gives instant life and a focal
  colour, as on the watchtower.

## Crowns — how the tower ends

The top is the most-seen part against the sky. Pick one and commit:

- **Crenellated parapet (battlements):** the classic. A ring of merlons — alternate a 1-tall block /
  gap around the rim (`*_wall`, `*_brick` blocks, `*_stairs` reversed) — over a corbel ring. Add a
  `lantern`/`campfire`/brazier at the corners. Reads as a fighting platform you can stand on (give
  it a floor + a hatch up).
- **Conical / pyramidal spire:** step `*_stairs` inward course-by-course to a point (square →
  pyramid; octagon → cone), in a **dark contrasting** material (`deepslate_tile_stairs`,
  `dark_oak_stairs`, `nether_brick_stairs`, `blackstone_stairs`). Cap the apex with a `lightning_rod`
  / `end_rod` / `*_fence` + `lantern` finial, optionally a `beacon` beam (image 4). The classic
  wizard/watchtower spire.
- **Horns / claws (dark-fantasy):** the Barad-dûr / Sauron crown (images 2–3). Two-to-four jagged
  spikes sweep **up and outward** from the rim — build one horn as a curving stack of `*_stairs`
  half:top stepping outward then `pointed_dripstone`/`lightning_rod`/`*_wall` tips, then `rotate`
  ×3 (or `mirror`) around the top. Frame the focal element (the eye) between them.
- **Open belfry / lantern cage:** the top stage is open-sided — pillars at the corners carry the
  spire, with `iron_bars`/`*_fence` infill and a big `lantern`/`sea_lantern`/beacon glowing inside
  (lighthouse, bell tower).
- **Finial cluster:** even without a full spire, crown a flat-ish top with a forest of
  `lightning_rod`/`end_rod`/`pointed_dripstone`/`*_fence`+`lantern` spikes of varied height (image 1's
  bristling top) so the silhouette is spiky, not blunt.

---

## Lighting — what makes a night tower

Towers are dramatic at night; lighting **draws the silhouette**. (See [`06`](06-decoration-and-interiors.md)
for the lighting palette.) Per the reference images, lighting is half the build:

- **Hanging lanterns on chains:** off every tier overhang, drop a `chain` + `lantern`/`soul_lantern`
  (image 1's blue dots). `lantern hanging:true` under a corbel, or 1–3 `chain` then a `lantern`,
  ringing the platform. **`soul_lantern`/`soul_fire` = cold blue** (dark/eldritch tower);
  **`lantern`/`campfire` = warm orange** (medieval/lived-in, image 4).
- **Glowing windows:** back each window slit with a light block behind the glass —
  `sea_lantern`/`glowstone`/`shroomlight`/`froglight` behind `*_stained_glass_pane`, or
  `soul_fire`/`fire` in a recess for a flickering blue/orange glow. Lit windows up the shaft give the
  tower its scale at night.
- **Accent veins (volcanic / eldritch):** run **glowing strips down the shaft** — `lava` in a
  channel, `magma_block`, `shroomlight`, `glowstone`, `crying_obsidian` + lava (image 5's cascading
  orange; image 3's base ring). One vertical lava seam between ribs is hugely effective on a black
  tower.
- **Base ring of light:** dot `lantern`/`fire`/`torch`/`redstone_lamp` around the foot (images 3,5)
  so the base reads at night and the tower looks "inhabited".
- **The focal glow:** if there's an eye/beacon/crystal at the crown, it's the brightest thing —
  `lava`/`fire`/`glowstone`/`magma` for fiery, `sea_lantern`/`end_rod`/`beacon` for cold.

---

## Surface & material grammar

Towers come in **both** dark-fantasy and bright/warm flavours — don't default to a grey keep every
time; match the palette to the archetype and the prompt. Whichever you pick, build the read with a
tight palette and contrast in *texture*, then a clear accent.

**Bright / warm palettes (fairy-tale, clock tower, copper, cosy):**
- **Fairy-tale spire:** `quartz_block`/`calcite`/`diorite` field with `oak`/`spruce` log framing and
  `*_stairs` trim, a steep conical roof in `red_/brown_*_terracotta`/`nether_bricks`/`*_copper`,
  `purple`/`magenta` `*_stained_glass`, lots of `vine`/`flowering_azalea` greenery, warm `lantern`s.
- **Brick clock tower:** `bricks` + `stone_bricks` + `*_log` half-timber, `dark_oak`/`spruce` gabled
  spire, a glowing clock dial, warm `lantern`s, cottages at the foot.
- **Verdigris/copper:** `oxidized_/weathered_copper` (+ `cut_copper`) roofs and bands over a
  `dark_oak`/`mangrove` trunk, `sea_lantern`/`amethyst` glow.

**Dark-fantasy palettes** (much of the keep/spire reference set is dark stone) — contrast in *texture*,
not hue:

- **Deepslate keep (images 1–2):** `polished_deepslate` + `deepslate_bricks` + `deepslate_tiles`
  field, `chiseled_deepslate` in the recessed bays, `cobbled_deepslate` for the rugged base, ribs in
  `polished_basalt`. Trim/seam with `blackstone`/`gilded_blackstone`. Cold light: `soul_lantern`,
  `soul_fire`, `chain`.
- **Blackstone fortress:** `polished_blackstone_bricks` + `blackstone` + `gilded_blackstone` accents,
  `basalt` ribs, `crying_obsidian` veins, lava strips (image 5).
- **Smooth obsidian spire (Sauron, image 3):** `obsidian`/`crying_obsidian`/`blackstone` smooth
  shaft with sparse vertical seams, horns of `polished_blackstone_brick_stairs`, the eye in
  `lava`/`magma_block`/`fire`/`glowstone`/orange `*_terracotta` ringed by `netherrack`/`magma`.
- **Medieval watchtower (image 4):** round `stone_bricks` (+`mossy_`/`cracked_`/`cobblestone`
  noise), `*_log`/`chiseled_stone_bricks` quoin ribs, a steep `deepslate_tile`/`dark_oak`
  **conical roof**, warm `lantern`s, arrow-slit windows, a small wooden bartizan.

General surface rules (as [`10`](10-design-principles.md)/[`12`](12-exterior-and-facade-detailing.md)):
mix 2–3 textures of the same family (~10–20% noise of `cracked_`/`mossy_`/`cobbled_` into the field
brick), recess the windows 1 block into the wall, and keep the ribs in one clearly distinct block.

---

## Windows & openings (vertical, narrow)

Tower windows are **tall and narrow**, not domestic:

- **Arrow slits / loopholes:** 1 wide × 2–3 tall, sometimes a `+` cross-slit; carve as air or fill a
  single `glass_pane`/`iron_bars`, set in a deep stone reveal. Cheap and very "fortified".
- **Tall lancet windows:** 1–2 wide × 3–5 tall, `*_stained_glass_pane`, top **arched** by stepping
  `*_stairs half:top` to a keystone (Gothic).
- **Align them up a vertical line** (one per tier on the same face) so they reinforce the verticality,
  and back them with light (above) so they glow.
- A single **large feature window/opening** near the crown (a wheel/rose window, a balcony arch, the
  eye socket) earns the climb — make it the biggest opening on the tower.

---

## The interior — a stack of distinct furnished floors (NOT an empty shaft)

The shaft is hollow with a way up — but "hollow" means *roomed and furnished*, not *empty*. The
preview's top-down floor-plan cutaways show every storey, so an empty tube is as much a failure as an
empty house. Build the shell, floor it into storeys, run a stair core, then **dress each floor as its
own themed room** — the great tower interiors (library, study, alchemy lab, great hall, observatory)
are a *vertical sequence of distinct, fully-furnished rooms*, each different from the last.

> **A tower often sits on a much larger basement / undercroft** — a 6×6 shaft over a 20×20 cellar of
> rooms and corridors is a classic keep. The build's footprint then comes from the **basement**, with
> the tower centred over it; see [`02`](02-coordinates-and-layout.md) §"mixed footprints" and
> [`08`](08-complex-structures.md) §"Levels can have different footprints". Size the box to the
> basement and don't shrink the request — there's no width/depth limit.

**Structure of the interior:**
- One `hollow`/`walls`+floors per shaft segment leaves the interior open; carve windows with an air
  index afterward. **Floor each storey** with a `*_slab`/`fill` platform (leave the stair hole).
- **Vertical circulation:** a `ladder` column up one inside wall, or a **spiral stair** hugging the
  inner wall winding up — build each straight quarter-run with a short **`stairs` op** (turning 90° at
  each landing) so every run climbs correctly and cuts its own hole. Keep the stair against the wall so
  the centre of each floor stays usable.
- Give the shaft enough internal diameter to be a *room* — a 3×3 interior is a closet. Aim for ≥5×5
  clear inside (often more) so each floor can hold furniture around a central walking space.

**Furnish each floor as a different themed room** (pick a sequence that fits the archetype, e.g. mage
tower = entry hall → library → study/bedroom → alchemy lab → observatory deck):
- **Library / study:** walls lined with `bookshelf`/`chiseled_bookshelf`, a `lectern`, desks
  (`*_stairs`+`*_slab`), a reading chair (stair+signs), a `chain`→`lantern`/`sea_lantern` **chandelier**
  hung over the middle, rugs (`*_carpet`), potted plants and `vine` in the corners (the wizard-library
  refs).
- **Cozy chamber / bedroom:** `bed`, nightstand (`barrel`+lantern), wardrobe (`*_trapdoor` doors on a
  shelf), a fireplace (`campfire`/`furnace` in a brick recess with a `chain` flue), a window seat with
  carpet, plants, a banner.
- **Alchemy / ritual room:** symmetric layout, `brewing_stand`/`cauldron`s, `chiseled_bookshelf` walls,
  `candle`s, an altar focal point at the far end (an `enchanting_table`/`lodestone`/`*_anvil` framed by
  `amethyst`/crimson accents and `lantern`s) — the crimson ritual ref.
- **Great hall:** a taller double-height floor with a **patterned tile floor** (2-tone
  `*_bricks`+`polished_*` diamond/runner), pillars or arches, banners, a long table, a big chandelier.
- **Observatory / top room:** behind the feature window — a telescope (`*_fence`+`spyglass`-feel via
  end_rod/`lightning_rod`), star charts (`item_frame`+`map`), `amethyst` crystals, the brightest light.
- **Lighting & atmosphere every floor:** a chandelier or wall sconces (see [`06`](06-decoration-and-interiors.md)),
  no dark floors; coffer the ceilings with `*_log` beams so they aren't flat slabs.

Spend the most detail on the **rooms behind the feature openings** (the lit chamber behind the rose
window, the platform behind the parapet) since those read from outside too.

---

## Tower archetypes (palette + crown + signature moves)

| Archetype | Shaft material | Crown | Signature moves |
|-----------|----------------|-------|-----------------|
| **Dark deepslate keep** (img 1) | `polished_deepslate`/`deepslate_bricks` + `chiseled` bays, `basalt` ribs | finial cluster (`lightning_rod`/`end_rod`) over a parapet | tier corbel rings, soul-lantern-on-chain swags, exterior ladders, stepped island base |
| **Barad-dûr horned tower** (img 2–3) | smooth `blackstone`/`obsidian`, sparse seams, buttress fins | 2–4 sweeping **horns** framing a glowing eye | strong taper, splayed buttress base, fiery eye (`lava`/`magma`/`glowstone`), base ring of light |
| **Medieval watchtower** (img 4) | round `stone_bricks` (+mossy/cracked), `*_log` quoins | steep **conical spire** + lantern/beacon finial | machicolation ring, arrow slits, warm lanterns, cantilevered wooden bartizan |
| **Wizard / mage spire** | `stone_bricks`/`deepslate` + `*_copper`/`purpur` accents | tall slim spire + `beacon`/`end_rod`, crystal | leaning/tapering shaft, glowing arcane windows (`amethyst`/`sea_lantern`), floating rings |
| **Fairy-tale / Rapunzel spire** | bright `quartz`/`calcite`/`diorite` + `oak`/`spruce` framing | tall steep **conical roof** in `*_terracotta`/`nether_brick`/copper, finial | slender, **projecting balconies & bay windows**, bracket-arm hanging lanterns, cascading `vine`s, coloured `*_stained_glass`, arched door |
| **Clock tower** | warm `bricks`/`stone_bricks` + `*_log` framing | steep **gabled/hip spire** with dormers, weathervane | a **clock face** feature (target/note-block/`item_frame` dial under the gable), attached cottages/annexes at the foot, gardens |
| **Verdigris / copper fantasy** | `*_copper` (oxidized/weathered) + dark `*_log` trunk | **patina copper / prismarine cones** | **satellite turrets** cantilevered at varied heights off a central trunk, glowing (`amethyst`/`sea_lantern`) windows, very organic |
| **Lighthouse** | `*_concrete`/`smooth_stone` banded, `bricks` base | open lantern cage, big `sea_lantern`/beacon | bold horizontal stripes (the exception), gallery rail near top, rocky/island base, sea |
| **Volcanic / infernal tower** (img 5) | rugged `blackstone`/`netherrack`/`basalt` | jagged broken crown, smoke (`campfire`) | cascading **lava veins** + `magma`/`shroomlight` glow, ruined irregular silhouette, organic rock base |

---

## Worked build order (follow this sequence — don't stack boxes)

A reliable recipe that produces a *real* tower instead of stacked crates. Adapt the materials/crown to
the archetype; the **order and the moves** are the point. Say the shaft is ~9×9; centre it on a wider
base.

1. **Foundation & flared base.** `fill` a solid foundation slab one course tall, slightly **wider**
   than the shaft (e.g. 11×11 under a 9×9 shaft). Build the base as a 3–4-course `hollow` plinth that
   is wider than the shaft and ideally **steps/batters inward** as it rises to meet the shaft width —
   on rough `cobblestone`/`cobbled_deepslate`. This is the flare; never start the shaft straight off
   grass.
2. **Shaft shell.** One `hollow` for the body (≥5×5 *interior* so floors are usable). Keep it tall.
3. **Vertical ribs, full height.** `line` a contrasting rib (`*_log axis:y`, basalt, a wall column) up
   **one corner**, then `rotate` it ×3 about the tower centre to get all four. Ribs that run *through*
   the whole shaft are what stop it reading as separate boxes.
4. **A corbel/string ring** (`walls` of `*_slab type:top` or `*_stairs half:top`) projecting **1 block
   past the shaft** at ~⅔ height — the overhang.
5. **Setback upper tier.** Above the ring, a **narrower** `hollow` tier (step in 1–2 blocks) so the
   tower **tapers**. This is the difference between a tower and a chimney.
6. **Crown — never a flat lid.** Either a **battlement** (`walls` of `*_wall`/blocks, then `fill` an
   air index on alternate rim cells for crenels) over a corbel ring, **or** a **spire**: the `roof` op
   with `style:"hip"` over the top tier makes a pyramidal/conical cap to a point — cap the apex with a
   `lightning_rod`/`end_rod`/`*_fence`+`lantern` finial (+ a `*_banner` mast for medieval).
7. **Floors & stair core.** `fill` a `*_slab`/plank floor per storey (leave the stair hole), and run a
   **spiral stair** as short `stairs` ops (quarter-runs turning 90°, with `fill` + `clear`) hugging the
   inner wall.
8. **Openings.** Carve tall narrow window slits to air, **aligned up a vertical line** on each face,
   glaze with `*_pane`/`iron_bars`, and back them with a light block so they glow. Carve an **arched
   doorway** at the base with a step approach.
9. **Break the outline.** Add 2–3 projections at different heights — a **balcony** on corbels with a
   fence rail, a **bay window**, a **bracket-arm hanging lantern**, a small **bartizan** with its own
   spire. Asymmetry is good.
10. **Dress it.** Hang `chain`+`lantern` swags off the rings, drape `vine`/`glow_lichen` down the
    stone, noise ~10–20% `mossy_`/`cracked_` into the field, and **furnish every interior floor** as a
    distinct themed room (see "The interior").
11. **Review the cutaways** — fix a flat top, an un-tapered shaft, bare interiors, or dark floors
    before stopping.

## Tower audit (catch in the preview — [`07`](07-workflow.md))

- ❌ A stack of identical boxes with hard seams between storeys → ✅ continuous ribs/buttresses running
  through the storeys + a real taper, so it reads as one tower, not piled crates.
- ❌ Constant-width extruded monolith → ✅ flared base + tiered/tapering shaft + distinct crown.
- ❌ Plain square, every face the same, no projections → ✅ pick an archetype and break the outline
  with balconies, bay windows, bartizans, bracket lanterns, vines (asymmetry welcome).
- ❌ Empty/bare interior floors (just a stair in a tube) → ✅ each floor a distinct furnished themed
  room (library/study/lab/hall) with a chandelier, lit, walls dressed.
- ❌ Pole on flat grass → ✅ battered base / buttress fins / stepped foundation on rock or an island.
- ❌ Flat top that just stops → ✅ parapet, spire, or horn/finial crown, ideally wider/busier than
  the shaft top, with the focal element up there.
- ❌ Horizontal banding everywhere (reads short) → ✅ vertical ribs/seams + recessed bays; horizontals
  only at deliberate tier rings.
- ❌ One flat stone texture → ✅ rib/recess rhythm, 2–3 same-family textures, ~10–20% noise.
- ❌ Domestic square windows → ✅ tall narrow slits/lancets aligned up a vertical line, back-lit.
- ❌ Dark and unlit at night → ✅ hanging chain-lanterns off the tiers, glowing windows, accent
  veins, a base ring of light, a bright focal crown.
- ❌ Shaft `fill`ed solid (no interior) → ✅ `hollow` shell with a ladder/spiral-stair core and
  floored tiers.
- ❌ Balcony/bartizan with no support or no way in → ✅ corbels under it, a door/window from the shaft.
