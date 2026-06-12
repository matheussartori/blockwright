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
import { SURROUND_MARGINS, expandSizeForSurroundings } from '@/shared/domain/surroundings';
import { readAuthoring, writeStructureFile } from '../../authoring';
import { resolveBlocks } from '../../authoring/ops';
import type { AuthoringStructure } from '../../authoring/types';
import { getSurroundings, insetHouseBox, listSurroundings } from '../surroundings';
import { getStructureType } from '../structure-types';
import { box } from '../structure-types/types';
import { moduleAppliesTo } from '@/shared/domain/applies-to';

/** The modern shell (15×13×13) expanded by the modern ring's margins. */
const SHELL: [number, number, number] = [15, 13, 13];
const m = SURROUND_MARGINS.modern;
const SIZE: [number, number, number] = [SHELL[0] + m.side * 2, SHELL[1], SHELL[2] + m.front + m.back];

/** Expand a modern template at `size` to named blocks (+ compose warnings). */
function expand(size: [number, number, number], params: Record<string, unknown>) {
  const authoring: AuthoringStructure = {
    DataVersion: 3955,
    size,
    palette: [{ Name: 'minecraft:air' }],
    ops: [{ op: 'template', name: 'modern', from: [0, 0, 0], to: [size[0] - 1, size[1] - 1, size[2] - 1], params }],
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
      expect(SURROUND_MARGINS[id], `${id} must declare its shared ring margins`).toBeTruthy();
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
});
