# 14 — Towers & vertical focal points (standalone)

[`05`](05-building-houses.md) builds a house shell and [`12`](12-exterior-and-facade-detailing.md)
treats a tower as *one feature of a bigger house*. This file is about the **tower as the whole
build** — a tall vertical structure that has to read as deliberate from the ground to the crown:
wizard spire, watchtower, dark-fantasy keep, lighthouse, Barad-dûr / Eye-of-Sauron style horned
tower. It's the vertical twin of [`12`](12-exterior-and-facade-detailing.md).

The through-line of every good tower: **a grounded flared base, a shaft with strong vertical
emphasis broken into tiers, and a dramatic crown** — plus lighting that defines the silhouette at
night. A constant-width extruded column with a flat top is the failure mode; almost everything
below fights that.

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

## Surface & material grammar (dark-fantasy default)

The reference set is overwhelmingly **dark stone**. Build the strongest read with a tight, dark
palette and contrast in *texture*, not hue:

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

## The interior core (keep it a shell)

The shaft is hollow with a way up — don't pack it solid:

- One `hollow`/`walls`+floors per shaft segment leaves the interior open. Carve the windows with an
  air index afterward.
- **Vertical circulation:** a `ladder` column up one inside wall, or a **spiral stair** of `*_stairs`
  hugging the inner wall winding up (offset +1 facing each course as it turns the corner — or build
  one quarter-run and `rotate` it up the levels). Floor each tier with a `*_slab`/`fill` platform and
  a hatch/opening to the next.
- Most of the interior won't be seen in the preview from outside; spend detail on the **rooms behind
  the feature openings** (a lit chamber behind the rose window, the platform behind the parapet).

---

## Tower archetypes (palette + crown + signature moves)

| Archetype | Shaft material | Crown | Signature moves |
|-----------|----------------|-------|-----------------|
| **Dark deepslate keep** (img 1) | `polished_deepslate`/`deepslate_bricks` + `chiseled` bays, `basalt` ribs | finial cluster (`lightning_rod`/`end_rod`) over a parapet | tier corbel rings, soul-lantern-on-chain swags, exterior ladders, stepped island base |
| **Barad-dûr horned tower** (img 2–3) | smooth `blackstone`/`obsidian`, sparse seams, buttress fins | 2–4 sweeping **horns** framing a glowing eye | strong taper, splayed buttress base, fiery eye (`lava`/`magma`/`glowstone`), base ring of light |
| **Medieval watchtower** (img 4) | round `stone_bricks` (+mossy/cracked), `*_log` quoins | steep **conical spire** + lantern/beacon finial | machicolation ring, arrow slits, warm lanterns, cantilevered wooden bartizan |
| **Wizard / mage spire** | `stone_bricks`/`deepslate` + `*_copper`/`purpur` accents | tall slim spire + `beacon`/`end_rod`, crystal | leaning/tapering shaft, glowing arcane windows (`amethyst`/`sea_lantern`), floating rings |
| **Lighthouse** | `*_concrete`/`smooth_stone` banded, `bricks` base | open lantern cage, big `sea_lantern`/beacon | bold horizontal stripes (the exception), gallery rail near top, rocky/island base, sea |
| **Volcanic / infernal tower** (img 5) | rugged `blackstone`/`netherrack`/`basalt` | jagged broken crown, smoke (`campfire`) | cascading **lava veins** + `magma`/`shroomlight` glow, ruined irregular silhouette, organic rock base |

---

## Tower audit (catch in the preview — [`07`](07-workflow.md))

- ❌ Constant-width extruded column → ✅ flared base + tiered/tapering shaft + distinct crown.
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
