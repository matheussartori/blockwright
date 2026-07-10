import { describe, expect, it } from 'vitest';
import type { PendingWorldEdit } from '../edit-overlay';
import { isGroundBlock, planTerrainBlend, type BlendPlanInput, type TerrainSampler } from '../blend';

const AIR = 'minecraft:air';
const GRASS = { name: 'minecraft:grass_block', properties: { snowy: 'false' } };
const DIRT = { name: 'minecraft:dirt' };

/** A deterministic sloped terrain: ground rises 1 block per +x step from `baseY` at x=0,
 *  grass-capped dirt columns, air above, with optional foliage decorations. */
function slopeSampler(baseY: number, foliage: Record<string, string> = {}): TerrainSampler {
  const groundY = (x: number) => baseY + Math.max(0, x);
  return {
    surfaceAt: (x) => ({ y: groundY(x), surface: GRASS, filler: DIRT }),
    blockAt: (x, y, z) => {
      const f = foliage[`${x},${y},${z}`];
      if (f) return f;
      const g = groundY(x);
      if (y > g) return AIR;
      return y === g ? GRASS.name : DIRT.name;
    },
  };
}

/** A flat 4×4 one-block-tall stone slab placement at (0, y0, 0). */
function slab(y0: number, w = 4, d = 4): BlendPlanInput {
  const edits: PendingWorldEdit[] = [];
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) edits.push({ x, y: y0, z, name: 'minecraft:stone' });
  return { edits, anchor: [0, y0, 0], size: [w, 1, d] };
}

const at = (edits: PendingWorldEdit[], x: number, y: number, z: number) =>
  edits.find((e) => e.x === x && e.y === y && e.z === z);

describe('isGroundBlock', () => {
  it('accepts terrain and rejects foliage/fluids/air', () => {
    expect(isGroundBlock('minecraft:grass_block')).toBe(true);
    expect(isGroundBlock('minecraft:stone')).toBe(true);
    expect(isGroundBlock('minecraft:sand')).toBe(true);
    expect(isGroundBlock('minecraft:air')).toBe(false);
    expect(isGroundBlock('minecraft:water')).toBe(false);
    expect(isGroundBlock('minecraft:oak_leaves')).toBe(false);
    expect(isGroundBlock('minecraft:oak_log')).toBe(false);
    expect(isGroundBlock('minecraft:tall_grass')).toBe(false);
  });
});

describe('planTerrainBlend — foundation', () => {
  it('pillars every grounded column down to the terrain with the column filler', () => {
    // Slab base at y=14 over ground y=10..13 (slope): columns at x=0 need 3 fill cells.
    const plan = planTerrainBlend(slab(14), slopeSampler(10), { foundation: true, feather: 0, excavate: false });
    // x=0: ground 10 → fill 11..13. x=3: ground 13 → nothing (base sits at 14, gap none).
    expect(at(plan, 0, 13, 0)?.name).toBe(DIRT.name);
    expect(at(plan, 0, 11, 0)?.name).toBe(DIRT.name);
    expect(at(plan, 0, 10, 0)).toBeUndefined(); // the surface itself is untouched
    expect(at(plan, 3, 13, 0)).toBeUndefined();
    // NO floating column: every gap cell under the footprint is filled.
    for (let x = 0; x < 4; x++)
      for (let y = 10 + Math.max(0, x) + 1; y < 14; y++)
        expect(at(plan, x, y, 0)?.name).toBe(DIRT.name);
  });

  it('never grows a pillar under an awning column (solid only above the base layers)', () => {
    const input: BlendPlanInput = {
      edits: [{ x: 0, y: 20, z: 0, name: 'minecraft:stone' }], // solid 6 above the box base
      anchor: [0, 14, 0],
      size: [1, 8, 1],
    };
    const plan = planTerrainBlend(input, slopeSampler(10), { foundation: true, feather: 0, excavate: false });
    expect(plan).toHaveLength(0);
  });

  it('never overwrites the placement itself and is deterministic', () => {
    const input = slab(12);
    const a = planTerrainBlend(input, slopeSampler(10), { foundation: true, feather: 3, excavate: true });
    const b = planTerrainBlend(input, slopeSampler(10), { foundation: true, feather: 3, excavate: true });
    expect(a).toEqual(b);
    const own = new Set(input.edits.map((e) => `${e.x},${e.y},${e.z}`));
    for (const e of a) expect(own.has(`${e.x},${e.y},${e.z}`)).toBe(false);
  });

  it('skips columns whose terrain is unknown', () => {
    const sampler = slopeSampler(10);
    const gaps: TerrainSampler = { ...sampler, surfaceAt: (x, z) => (x === 0 ? null : sampler.surfaceAt(x, z)) };
    const plan = planTerrainBlend(slab(14), gaps, { foundation: true, feather: 0, excavate: false });
    expect(plan.some((e) => e.x === 0)).toBe(false);
    expect(plan.some((e) => e.x === 1)).toBe(true);
  });
});

describe('planTerrainBlend — excavation', () => {
  it('clears terrain poking through UNDEFINED cells and leaves defined cells alone', () => {
    // A 2×3×1 box sunk into the hillside at x=2..3 (ground 12..13): the structure
    // defines only its walls at z? Here: define y=10 floor only; y=11..12 omitted.
    const edits: PendingWorldEdit[] = [
      { x: 2, y: 10, z: 0, name: 'minecraft:stone' },
      { x: 3, y: 10, z: 0, name: 'minecraft:stone' },
    ];
    const input: BlendPlanInput = { edits, anchor: [2, 10, 0], size: [2, 3, 1] };
    const plan = planTerrainBlend(input, slopeSampler(10), { foundation: false, feather: 0, excavate: true });
    // Ground at x=2 is y=12: omitted cells y=11..12 are cleared; the box top (y=12) bounds it.
    expect(at(plan, 2, 11, 0)?.name).toBe(AIR);
    expect(at(plan, 2, 12, 0)?.name).toBe(AIR);
    expect(at(plan, 2, 10, 0)).toBeUndefined(); // defined by the structure
    // x=3 ground y=13 — the box only reaches y=12, so 13 stays.
    expect(at(plan, 3, 13, 0)).toBeUndefined();
    expect(at(plan, 3, 12, 0)?.name).toBe(AIR);
  });

  it('does nothing where terrain sits below the box', () => {
    const plan = planTerrainBlend(slab(20), slopeSampler(5), { foundation: false, feather: 0, excavate: true });
    expect(plan).toHaveLength(0);
  });
});

describe('planTerrainBlend — feather ring', () => {
  it('raises the downhill ring toward the base and caps with the surface block', () => {
    // Slab at y=14 on flat ground y=10: the ring must step down from ~13 to 10.
    const flat = slopeSampler(10);
    const flatFlat: TerrainSampler = { surfaceAt: () => ({ y: 10, surface: GRASS, filler: DIRT }), blockAt: (x, y) => (y > 10 ? AIR : y === 10 ? GRASS.name : DIRT.name) };
    void flat;
    const plan = planTerrainBlend(slab(14), flatFlat, { foundation: false, feather: 4, excavate: false });
    // Ring d=1 (x=-1): target ≈ 13 - dithered — always above the old ground.
    const ringCol = plan.filter((e) => e.x === -1 && e.z === 1 && e.name !== AIR);
    expect(ringCol.length).toBeGreaterThan(0);
    const top = Math.max(...ringCol.map((e) => e.y));
    expect(top).toBeGreaterThan(10);
    expect(top).toBeLessThan(14);
    // The cap is the surface block, the body the filler.
    expect(at(plan, -1, top, 1)?.name).toBe(GRASS.name);
    if (top > 11) expect(at(plan, -1, 11, 1)?.name).toBe(DIRT.name);
    // The ring level decays with distance: farther columns are never higher than nearer ones.
    const topAt = (x: number) => {
      const col = plan.filter((e) => e.x === x && e.z === 1 && e.name !== AIR);
      return col.length ? Math.max(...col.map((e) => e.y)) : 10;
    };
    expect(topAt(-1)).toBeGreaterThanOrEqual(topAt(-2));
    expect(topAt(-2)).toBeGreaterThanOrEqual(topAt(-3));
    // Nothing beyond the ring radius.
    expect(plan.some((e) => e.x < -4 || e.z < -4)).toBe(false);
  });

  it('cuts the uphill ring down toward the base and re-caps the cut', () => {
    // Slab base at y=10 against a slope that reaches y=18 at x=8: the ring right of the
    // footprint (x=4..) must cut terrain down toward y=9.
    const plan = planTerrainBlend(slab(10), slopeSampler(10), { foundation: false, feather: 4, excavate: false });
    const cutCol = plan.filter((e) => e.x === 4 && e.z === 1);
    expect(cutCol.some((e) => e.name === AIR)).toBe(true);
    // The new top of the cut column is re-capped with the surface block.
    const cap = cutCol.find((e) => e.name === GRASS.name);
    expect(cap).toBeDefined();
    // Every cell above the cap in that column is air.
    for (const e of cutCol) if (e.name === AIR) expect(e.y).toBeGreaterThan(cap!.y);
  });

  it('clears soft foliage stranded above a cut column', () => {
    const foliage = { '4,15,1': 'minecraft:tall_grass' }; // sits on ground y=14 at x=4
    const plan = planTerrainBlend(slab(10), slopeSampler(10, foliage), { foundation: false, feather: 4, excavate: false });
    expect(at(plan, 4, 15, 1)?.name).toBe(AIR);
  });

  it('feather 0 emits no ring edits', () => {
    const plan = planTerrainBlend(slab(14), slopeSampler(10), { foundation: false, feather: 0, excavate: false });
    expect(plan).toHaveLength(0);
  });
});
