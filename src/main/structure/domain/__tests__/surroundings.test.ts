// The SURROUNDINGS ring — the yard a structure type lays OUTSIDE its shell when the
// user picks a surroundings module. The contract under test: the user's W×D is the
// BUILDING SHELL, the box grows by the shared margins, the house is inset to leave the
// ring, and the ring is real landscaping (pool, entry walk aligned with the door,
// hedge, lawn) that stays LOW (never reads as construction) and SURVIVES the compile
// pass pipeline (the in-game `.nbt` keeps the pool and the persistent hedge).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SURROUND_SCALE, expandSizeForSurroundings, resolveSurroundMargins, surroundMargins, surroundMarginsForOuter } from '@/shared/domain/surroundings';
import { readAuthoring, writeStructureFile } from '../../authoring';
import { resolveBlocks } from '../../authoring/ops';
import type { AuthoringStructure } from '../../authoring/types';
import { getSurroundings, insetHouseBox, listSurroundings } from '../surroundings';
import { getStructureType } from '../structure-types';
import { box } from '../structure-types/types';
import { moduleAppliesTo } from '@/shared/domain/applies-to';

/** The modern shell (15×13×13) expanded by the modern ring's margins. */
const SHELL: [number, number, number] = [15, 13, 13];
const m = surroundMargins('modern', SHELL[0], SHELL[2])!;
const SIZE: [number, number, number] = [SHELL[0] + m.side * 2, SHELL[1], SHELL[2] + m.front + m.back];

/** Expand a structure template at `size` to named blocks (+ compose warnings). */
function expand(size: [number, number, number], params: Record<string, unknown>, name = 'modern') {
  const authoring: AuthoringStructure = {
    DataVersion: 3955,
    size,
    palette: [{ Name: 'minecraft:air' }],
    ops: [{ op: 'template', name, from: [0, 0, 0], to: [size[0] - 1, size[1] - 1, size[2] - 1], params }],
  };
  const resolved = resolveBlocks(authoring);
  const at = new Map<string, { name: string; props?: Record<string, unknown> }>();
  for (const b of resolved.blocks) {
    const entry = resolved.palette[b.state];
    if (entry) at.set(b.pos.join(','), { name: entry.Name, props: entry.Properties });
  }
  return { at, warnings: resolved.warnings };
}

const isSolid = (c?: { name: string }) => !!c && c.name !== 'minecraft:air';

describe('surroundings module contract', () => {
  it('every surroundings module declares appliesTo, knowledge and a preview, and its hosts resolve', () => {
    for (const id of listSurroundings().map((s) => s.id)) {
      const mod = getSurroundings(id)!;
      expect(mod.appliesTo.length, `${id}.appliesTo`).toBeGreaterThan(0);
      expect(mod.knowledge, `${id}.knowledge`).toMatch(/^nbt\/modules\/surroundings\//);
      expect(mod.preview, `${id}.preview`).toBeTruthy();
      expect(SURROUND_SCALE[id], `${id} must declare its shared ring scaling`).toBeTruthy();
      // At least one declared host is a real structure type whose param spec offers this module.
      const hosts = mod.appliesTo.map(getStructureType).filter((t) => t !== undefined);
      expect(hosts.length, `${id} hosts`).toBeGreaterThan(0);
      for (const host of hosts) {
        const def = host!.params.surroundings;
        expect(def?.kind === 'enum' && def.values.includes(id), `${host!.id} must offer surroundings "${id}"`).toBe(true);
        expect(moduleAppliesTo(mod.appliesTo, host!.id, host!.group)).toBe(true);
      }
    }
  });

  it('expandSizeForSurroundings grows the footprint by the margins and is identity for none', () => {
    expect(expandSizeForSurroundings(15, 13, 'modern')).toEqual({ w: 15 + m.side * 2, d: 13 + m.front + m.back });
    expect(expandSizeForSurroundings(15, 13, 'none')).toEqual({ w: 15, d: 13 });
    expect(expandSizeForSurroundings(15, 13, undefined)).toEqual({ w: 15, d: 13 });
    expect(expandSizeForSurroundings(15, 13, 'nope')).toEqual({ w: 15, d: 13 });
  });

  it('insetHouseBox is the exact inverse of the expansion (the shell keeps its size)', () => {
    const outer = box([0, 0, 0], [SIZE[0] - 1, SIZE[1] - 1, SIZE[2] - 1]);
    const inner = insetHouseBox(outer, 'modern');
    expect([inner.W, inner.H, inner.D]).toEqual(SHELL);
    expect(inner.z0).toBe(m.front); // the front margin is the entry/pool side
    expect(insetHouseBox(outer, 'none')).toEqual(outer);
  });

  it('margins SCALE with the house: a bigger shell earns a wider ring, capped at the max', () => {
    for (const id of Object.keys(SURROUND_SCALE)) {
      const small = surroundMargins(id, 11, 11)!;
      const big = surroundMargins(id, 27, 27)!;
      const huge = surroundMargins(id, 99, 99)!;
      expect(small).toEqual(SURROUND_SCALE[id].base); // at/below the reference: the base
      for (const k of ['front', 'back', 'side'] as const) {
        expect(big[k], `${id}.${k} grows`).toBeGreaterThan(small[k]);
        expect(big[k], `${id}.${k} capped`).toBeLessThanOrEqual(SURROUND_SCALE[id].max[k]);
      }
      expect(huge).toEqual(SURROUND_SCALE[id].max); // a mansion hits the cap, not infinity
    }
  });

  it('inset round-trips the expansion exactly at every shell size (both sides agree)', () => {
    for (const id of Object.keys(SURROUND_SCALE)) {
      for (const [w, d] of [[9, 9], [15, 13], [19, 17], [25, 21], [33, 29], [48, 40]]) {
        const grown = expandSizeForSurroundings(w, d, id);
        expect(surroundMarginsForOuter(id, grown.w, grown.d), `${id} ${w}x${d}`).toEqual(surroundMargins(id, w, d));
        const inner = insetHouseBox(box([0, 0, 0], [grown.w - 1, 9, grown.d - 1]), id);
        expect([inner.W, inner.D], `${id} ${w}x${d} shell`).toEqual([w, d]);
      }
    }
  });

  it('an explicit user margin override REPLACES the auto ring and round-trips exactly', () => {
    const override = { side: 10, front: 16, back: 12 }; // hand-set yard footprint (cells)
    for (const id of Object.keys(SURROUND_SCALE)) {
      for (const [w, d] of [[11, 11], [15, 13], [25, 21], [40, 34]]) {
        // The override is the effective ring regardless of shell size (it's manual).
        expect(resolveSurroundMargins(id, w, d, override), `${id} ${w}x${d} resolve`).toEqual(override);
        // The compiled box grows by exactly the override margins…
        const grown = expandSizeForSurroundings(w, d, id, override);
        expect([grown.w, grown.d]).toEqual([w + override.side * 2, d + override.front + override.back]);
        // …and the main-side derive returns the override directly (no inversion needed).
        expect(surroundMarginsForOuter(id, grown.w, grown.d, override), `${id} ${w}x${d} derive`).toEqual(override);
        const inner = insetHouseBox(box([0, 0, 0], [grown.w - 1, 9, grown.d - 1]), id, override);
        expect([inner.W, inner.D], `${id} ${w}x${d} shell`).toEqual([w, d]);
      }
    }
  });
});

describe('modern surroundings geometry (template expansion)', () => {
  const { at, warnings } = expand(SIZE, { surroundings: 'modern', floors: 2, seed: 7 });
  const inner = insetHouseBox(box([0, 0, 0], [SIZE[0] - 1, SIZE[1] - 1, SIZE[2] - 1]), 'modern');
  const cx = Math.floor((SIZE[0] - 1) / 2);

  it('composes with no module-respect warnings (the ring was actually built)', () => {
    expect(warnings).toEqual([]);
  });

  it('lays a pool (water), a lawn (grass) and a persistent hedge in the ring', () => {
    const cells = [...at.entries()];
    const ring = cells.filter(([k]) => {
      const [x, , z] = k.split(',').map(Number);
      return x < inner.x0 || x > inner.x1 || z < inner.z0 || z > inner.z1;
    });
    expect(ring.some(([, c]) => c.name === 'minecraft:water')).toBe(true);
    expect(ring.some(([, c]) => c.name === 'minecraft:grass_block')).toBe(true);
    const hedges = ring.filter(([, c]) => c.name === 'minecraft:oak_leaves');
    expect(hedges.length).toBeGreaterThan(10);
    for (const [, c] of hedges) expect(c.props?.persistent).toBe('true');
  });

  it('keeps the ring LOW — landscaping, never construction (max 2 cells above ground)', () => {
    for (const [k, c] of at) {
      const [x, y, z] = k.split(',').map(Number);
      const inRing = x < inner.x0 || x > inner.x1 || z < inner.z0 || z > inner.z1;
      if (inRing && isSolid(c)) expect(y, `ring block at ${k} (${c.name})`).toBeLessThanOrEqual(2);
    }
  });

  it('insets the house to the shell footprint (walls at the inner bounds, none beyond)', () => {
    // The house perimeter rises at the inner box: something solid well above yard height.
    expect(isSolid(at.get(`${inner.x0},4,${inner.z0 + 2}`))).toBe(true);
    expect(isSolid(at.get(`${inner.x1},4,${inner.z1 - 2}`))).toBe(true);
  });

  it('aligns the entry walk with the door and steps it at the street edge', () => {
    // Walk surface right in front of the door (the house's front wall is at inner.z0).
    expect(at.get(`${cx},0,${inner.z0 - 1}`)?.name).toBe('minecraft:smooth_quartz');
    // Threshold stairs across the walk's mouth at the box edge.
    expect(at.get(`${cx},0,0`)?.name).toBe('minecraft:smooth_quartz_stairs');
    // The perimeter hedge is gapped over the walk (the approach is open).
    expect(isSolid(at.get(`${cx},1,0`))).toBe(false);
  });

  it('cuts every yard corner (the grounds are never the plain rectangle)', () => {
    for (const [x, z] of [[0, 0], [SIZE[0] - 1, 0], [0, SIZE[2] - 1], [SIZE[0] - 1, SIZE[2] - 1]]) {
      expect(isSolid(at.get(`${x},0,${z}`)), `corner ${x},${z} must be cut`).toBe(false);
      expect(isSolid(at.get(`${x},1,${z}`)), `corner hedge ${x},${z} must be cut`).toBe(false);
    }
  });

  it('seeds vary the outline (two seeds disagree on some hedge cells)', () => {
    const other = expand(SIZE, { surroundings: 'modern', floors: 2, seed: 8 });
    const hedgeSet = (m: typeof at) =>
      new Set([...m.entries()].filter(([, c]) => c.name === 'minecraft:oak_leaves').map(([k]) => k));
    const a = hedgeSet(at), b2 = hedgeSet(other.at);
    expect([...a].some((k) => !b2.has(k)) || [...b2].some((k) => !a.has(k))).toBe(true);
  });

  it('builds the plain full-footprint villa when surroundings is none (no yard leaks in)', () => {
    const plain = expand(SIZE, { floors: 2, seed: 7 });
    expect(plain.warnings).toEqual([]);
    const names = new Set([...plain.at.values()].map((c) => c.name));
    expect(names.has('minecraft:grass_block')).toBe(false);
    expect(names.has('minecraft:oak_leaves')).toBe(false);
    // The house reaches the box rim again (wall on the x0 face, above yard height).
    expect(isSolid(plain.at.get(`0,4,${Math.floor(SIZE[2] / 2)}`))).toBe(true);
  });
});

describe('garden surroundings geometry (template expansion)', () => {
  const GSHELL: [number, number, number] = [13, 13, 11];
  const g = surroundMargins('garden', GSHELL[0], GSHELL[2])!;
  const GSIZE: [number, number, number] = [GSHELL[0] + g.side * 2, GSHELL[1], GSHELL[2] + g.front + g.back];
  const { at, warnings } = expand(GSIZE, { surroundings: 'garden', floors: 2, seed: 11 }, 'classic');
  const outer = box([0, 0, 0], [GSIZE[0] - 1, GSIZE[1] - 1, GSIZE[2] - 1]);
  const inner = insetHouseBox(outer, 'garden');
  const cx = Math.floor((GSIZE[0] - 1) / 2);
  const inRing = (x: number, z: number) => x < inner.x0 || x > inner.x1 || z < inner.z0 || z > inner.z1;

  it('composes with no module-respect warnings (the ring was actually built)', () => {
    expect(warnings).toEqual([]);
  });

  it('honours an explicit yard-size override end-to-end (bigger box, house still inset, no warnings)', () => {
    const sizing = { side: 12, front: 16, back: 12 };
    const big: [number, number, number] = [GSHELL[0] + sizing.side * 2, GSHELL[1], GSHELL[2] + sizing.front + sizing.back];
    const r = expand(big, { surroundings: 'garden', surroundSizing: sizing, floors: 2, seed: 11 }, 'classic');
    expect(r.warnings).toEqual([]);
    // The house is inset by the override margins, so the same shell sits inside the bigger box.
    const bigInner = insetHouseBox(box([0, 0, 0], [big[0] - 1, big[1] - 1, big[2] - 1]), 'garden', sizing);
    expect([bigInner.W, bigInner.D]).toEqual([GSHELL[0], GSHELL[2]]);
    expect(bigInner.x0).toBe(sizing.side);
  });

  it('rings the yard with a stone course topped by a wooden fence, lamp posts lit', () => {
    const cells = [...at.entries()].map(([k, c]) => ({ pos: k.split(',').map(Number), c }));
    const fences = cells.filter(({ c }) => c.name === 'minecraft:oak_fence');
    expect(fences.length).toBeGreaterThan(20);
    // Every fence sits on a stone base (y=2 over y=1), out in the ring — the perimeter
    // course is cobblestone; the well's crank posts stand on its stone-brick rim.
    for (const { pos: [x, y, z] } of fences) {
      expect(y, `fence at ${x},${y},${z}`).toBe(2);
      expect(inRing(x, z), `fence at ${x},${z} must be in the ring`).toBe(true);
      expect(['minecraft:cobblestone', 'minecraft:stone_bricks']).toContain(at.get(`${x},1,${z}`)?.name);
    }
    // Stone lamp posts carry the yard's lanterns at y=3.
    const lanterns = cells.filter(({ c, pos }) => c.name === 'minecraft:lantern' && pos[1] === 3 && inRing(pos[0], pos[2]));
    expect(lanterns.length).toBeGreaterThan(2);
  });

  it('every corner is chamfered (the outline varies — never the plain rectangle)', () => {
    for (const [x, z] of [[0, 0], [GSIZE[0] - 1, 0], [0, GSIZE[2] - 1], [GSIZE[0] - 1, GSIZE[2] - 1]]) {
      expect(isSolid(at.get(`${x},1,${z}`)), `corner ${x},${z} must be cut`).toBe(false);
    }
  });

  it('seeds vary the outline (two seeds disagree on some fence cells)', () => {
    const other = expand(GSIZE, { surroundings: 'garden', floors: 2, seed: 12 }, 'classic');
    const fenceSet = (m: typeof at) => new Set([...m.entries()].filter(([, c]) => c.name === 'minecraft:oak_fence').map(([k]) => k));
    const a = fenceSet(at), b = fenceSet(other.at);
    expect([...a].some((k) => !b.has(k)) || [...b].some((k) => !a.has(k))).toBe(true);
  });

  it('hangs a double door in the front gate, on a stone threshold', () => {
    for (const x of [cx, cx + 1]) {
      expect(at.get(`${x},1,0`)?.name, `gate lower at x=${x}`).toBe('minecraft:oak_door');
      expect(at.get(`${x},2,0`)?.name, `gate upper at x=${x}`).toBe('minecraft:oak_door');
      expect(at.get(`${x},0,0`)?.name).toBe('minecraft:cobblestone');
    }
  });

  it('cuts a walk from the gate to the door, distinct from the lawn', () => {
    for (let z = 1; z <= inner.z0 - 1; z++) {
      expect(at.get(`${cx},0,${z}`)?.name, `walk at z=${z}`).toBe('minecraft:dirt_path');
    }
    expect([...at.values()].some((c) => c.name === 'minecraft:grass_block')).toBe(true);
  });

  it('plants the working garden: crops on farmland, water, flowers and bushes', () => {
    const names = new Set([...at.entries()].filter(([k]) => {
      const [x, , z] = k.split(',').map(Number);
      return inRing(x, z);
    }).map(([, c]) => c.name));
    expect(names.has('minecraft:farmland')).toBe(true);
    expect(names.has('minecraft:wheat')).toBe(true);
    expect(names.has('minecraft:water')).toBe(true);
    expect(names.has('minecraft:poppy')).toBe(true);
    expect(names.has('minecraft:flowering_azalea_leaves')).toBe(true);
  });

  it('keeps the ring LOW — landscaping, never construction (max 3 cells above ground)', () => {
    for (const [k, c] of at) {
      const [x, y, z] = k.split(',').map(Number);
      if (inRing(x, z) && isSolid(c)) expect(y, `ring block at ${k} (${c.name})`).toBeLessThanOrEqual(3);
    }
  });

  it('insets the house to the shell footprint (walls at the inner bounds, none beyond)', () => {
    expect(isSolid(at.get(`${inner.x0},5,${inner.z0 + 2}`))).toBe(true);
    expect(isSolid(at.get(`${inner.x1},5,${inner.z1 - 2}`))).toBe(true);
  });

  it('every garden host composes the yard with zero warnings', () => {
    for (const host of ['farmhouse', 'sakura', 'gothic']) {
      const size: [number, number, number] = [15 + g.side * 2, 14, 13 + g.front + g.back];
      const r = expand(size, { surroundings: 'garden', floors: 2, seed: 5 }, host);
      expect(r.warnings, host).toEqual([]);
      expect([...r.at.values()].some((c) => c.name === 'minecraft:oak_fence'), `${host} fence`).toBe(true);
    }
  });
});

describe('graveyard surroundings geometry (template expansion)', () => {
  const YSHELL: [number, number, number] = [13, 15, 11];
  const y = surroundMargins('graveyard', YSHELL[0], YSHELL[2])!;
  const YSIZE: [number, number, number] = [YSHELL[0] + y.side * 2, YSHELL[1], YSHELL[2] + y.front + y.back];
  const { at, warnings } = expand(YSIZE, { surroundings: 'graveyard', floors: 2, seed: 21 }, 'gothic');
  const outer = box([0, 0, 0], [YSIZE[0] - 1, YSIZE[1] - 1, YSIZE[2] - 1]);
  const inner = insetHouseBox(outer, 'graveyard');
  const cx = Math.floor((YSIZE[0] - 1) / 2);
  const inRing = (x: number, z: number) => x < inner.x0 || x > inner.x1 || z < inner.z0 || z > inner.z1;
  const ringNames = new Set(
    [...at.entries()].filter(([k]) => { const [x, , z] = k.split(',').map(Number); return inRing(x, z); }).map(([, c]) => c.name),
  );

  it('is at least 4× the garden ring in both x and z (a grand, front-heavy cemetery)', () => {
    const g = surroundMargins('garden', YSHELL[0], YSHELL[2])!;
    expect(y.side * 2).toBeGreaterThanOrEqual(g.side * 2 * 4);
    expect(y.front + y.back).toBeGreaterThanOrEqual((g.front + g.back) * 4);
    expect(y.front).toBeGreaterThan(y.back); // front-weighted (the spacious approach)
  });

  it('composes with no module-respect warnings (the ring was actually built)', () => {
    expect(warnings).toEqual([]);
  });

  it('lays a grass lawn and a gravel approach, with the manor inset to the shell', () => {
    expect(ringNames.has('minecraft:grass_block')).toBe(true);
    expect(ringNames.has('minecraft:gravel')).toBe(true);
    // The approach runs up the centre to the manor door.
    expect(at.get(`${cx},0,1`)?.name).toBe('minecraft:gravel');
    // The manor reaches the inner (shell) bounds, above yard height.
    expect(isSolid(at.get(`${inner.x0},6,${inner.z0 + 2}`))).toBe(true);
    expect([inner.W, inner.D]).toEqual([YSHELL[0], YSHELL[2]]);
  });

  it('rings the grounds with a crumbling mossy-stone wall lit by soul lanterns', () => {
    expect(ringNames.has('minecraft:mossy_stone_bricks')).toBe(true);
    expect(ringNames.has('minecraft:cobblestone_wall')).toBe(true);
    const lanterns = [...at.entries()].filter(([k, c]) => {
      const [x, , z] = k.split(',').map(Number);
      return c.name === 'minecraft:soul_lantern' && inRing(x, z);
    });
    expect(lanterns.length).toBeGreaterThan(2);
  });

  it('sets an arched gate on a cobblestone threshold, aligned with the door', () => {
    for (const x of [cx - 1, cx, cx + 1]) expect(at.get(`${x},0,0`)?.name).toBe('minecraft:cobblestone');
    // Flanking piers rise on either side of the opening.
    expect(at.get(`${cx - 2},2,0`)?.name).toBe('minecraft:stone_bricks');
    expect(at.get(`${cx + 2},2,0`)?.name).toBe('minecraft:stone_bricks');
  });

  it('fills the grounds with graves, ruins and a weeping tree', () => {
    // Disturbed-earth grave mounds + headstones over the front grounds.
    expect(ringNames.has('minecraft:podzol')).toBe(true);
    expect(ringNames.has('minecraft:stone_brick_slab')).toBe(true);
    // The weeping tree (trunk + persistent canopy) is the focal point.
    expect(ringNames.has('minecraft:oak_log')).toBe(true);
    const leaves = [...at.entries()].filter(([k, c]) => {
      const [x, , z] = k.split(',').map(Number);
      return c.name === 'minecraft:oak_leaves' && inRing(x, z);
    });
    expect(leaves.length).toBeGreaterThan(8);
    for (const [, c] of leaves) expect(c.props?.persistent).toBe('true');
    // Overgrowth reclaiming the lawn.
    expect(ringNames.has('minecraft:poppy') || ringNames.has('minecraft:fern')).toBe(true);
  });

  it('every corner is chamfered (the outline varies — never a plain rectangle)', () => {
    for (const [x, z] of [[0, 0], [YSIZE[0] - 1, 0], [0, YSIZE[2] - 1], [YSIZE[0] - 1, YSIZE[2] - 1]]) {
      expect(isSolid(at.get(`${x},0,${z}`)), `corner ${x},${z} must be cut`).toBe(false);
    }
  });

  it('keeps every ring feature inside the build box height', () => {
    for (const [k, c] of at) {
      const [x, yy, z] = k.split(',').map(Number);
      if (inRing(x, z) && isSolid(c)) expect(yy, `ring block at ${k} (${c.name})`).toBeLessThanOrEqual(YSIZE[1] - 1);
    }
  });

  it('seeds vary the layout (two seeds disagree on some grave/wall cells)', () => {
    const other = expand(YSIZE, { surroundings: 'graveyard', floors: 2, seed: 22 }, 'gothic');
    const set = (m: typeof at) =>
      new Set([...m.entries()].filter(([, c]) => c.name === 'minecraft:mossy_stone_bricks').map(([k]) => k));
    const a = set(at), b = set(other.at);
    expect([...a].some((k) => !b.has(k)) || [...b].some((k) => !a.has(k))).toBe(true);
  });
});

describe('the ring scales with the house (big-shell template expansion)', () => {
  it.each([
    ['modern', 'modern', 25, 21],
    ['garden', 'classic', 25, 21],
  ] as const)('%s ring around a %s at 25×21 grows beyond the base and composes warning-free', (id, host, w, d) => {
    const gm = surroundMargins(id, w, d)!;
    expect(gm.side).toBeGreaterThan(SURROUND_SCALE[id].base.side);
    expect(gm.front).toBeGreaterThan(SURROUND_SCALE[id].base.front);
    const size: [number, number, number] = [w + gm.side * 2, 14, d + gm.front + gm.back];
    const r = expand(size, { surroundings: id, floors: 2, seed: 3 }, host);
    expect(r.warnings).toEqual([]);
    // The house still lands exactly on the user's shell inside the wider ring.
    const inner = insetHouseBox(box([0, 0, 0], [size[0] - 1, size[1] - 1, size[2] - 1]), id);
    expect([inner.W, inner.D]).toEqual([w, d]);
    // The ring's signature landscaping made it in.
    const names = new Set([...r.at.values()].map((c) => c.name));
    expect(names.has(id === 'garden' ? 'minecraft:oak_fence' : 'minecraft:oak_leaves')).toBe(true);
    expect(names.has('minecraft:grass_block')).toBe(true);
  });
});

describe('modern surroundings survives the compile pass pipeline', () => {
  it('keeps the pool water and the hedge through writeStructureFile (the in-game .nbt)', async () => {
    const authoring: AuthoringStructure = {
      DataVersion: 3955,
      size: SIZE,
      palette: [{ Name: 'minecraft:air' }],
      ops: [{ op: 'template', name: 'modern', from: [0, 0, 0], to: [SIZE[0] - 1, SIZE[1] - 1, SIZE[2] - 1], params: { surroundings: 'modern', floors: 2, seed: 7 } }],
    };
    const file = path.join(os.tmpdir(), `bw-surroundings-${Date.now()}.nbt`);
    try {
      await writeStructureFile(authoring, file, { structureType: 'modern' });
      const out = await readAuthoring(file);
      const names = new Map<number, string>();
      out.palette?.forEach((p, i) => names.set(i, p.Name));
      const blocks = out.blocks ?? [];
      expect(blocks.some((b) => names.get(b.state) === 'minecraft:water')).toBe(true);
      expect(blocks.some((b) => names.get(b.state) === 'minecraft:oak_leaves')).toBe(true);
      expect(blocks.some((b) => names.get(b.state) === 'minecraft:grass_block')).toBe(true);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('keeps the garden fence, gate doors and crops through writeStructureFile', async () => {
    const g = surroundMargins('garden', 13, 11)!;
    const size: [number, number, number] = [13 + g.side * 2, 13, 11 + g.front + g.back];
    const authoring: AuthoringStructure = {
      DataVersion: 3955,
      size,
      palette: [{ Name: 'minecraft:air' }],
      ops: [{ op: 'template', name: 'classic', from: [0, 0, 0], to: [size[0] - 1, size[1] - 1, size[2] - 1], params: { surroundings: 'garden', floors: 2, seed: 11 } }],
    };
    const file = path.join(os.tmpdir(), `bw-garden-${Date.now()}.nbt`);
    try {
      await writeStructureFile(authoring, file, { structureType: 'classic' });
      const out = await readAuthoring(file);
      const names = new Map<number, string>();
      out.palette?.forEach((p, i) => names.set(i, p.Name));
      const blocks = out.blocks ?? [];
      const count = (n: string) => blocks.filter((b) => names.get(b.state) === n).length;
      expect(count('minecraft:oak_fence')).toBeGreaterThan(20);
      expect(count('minecraft:oak_door')).toBeGreaterThanOrEqual(4); // the double gate survives fixDoors/fixPlacement
      expect(count('minecraft:farmland')).toBeGreaterThan(0);
      expect(count('minecraft:wheat')).toBeGreaterThan(0);
      expect(count('minecraft:dirt_path')).toBeGreaterThan(0);
      expect(count('minecraft:lantern')).toBeGreaterThan(2);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});
