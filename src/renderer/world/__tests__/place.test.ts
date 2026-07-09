// The place-into-world math: the rotation mapping, its agreement with the Three.js ghost
// transform (what you preview is what lands), and the paste semantics (air clears,
// structure_void/omitted preserve, directional blockstates rewritten).
import { describe, expect, it } from 'vitest';
import type { PaletteEntry, StructureBlock } from '@/shared/types';
import { ghostTransform, planPlacement, rotateCell, rotateEntityNbt, rotatePoint, rotatedSize, type PlaceTurns, type Vec3 } from '../place';

const SIZE: Vec3 = [3, 2, 5];
const TURNS: PlaceTurns[] = [0, 1, 2, 3];

const entry = (name: string, properties?: Record<string, string>, air = false): PaletteEntry => ({
  name,
  ...(properties ? { properties } : {}),
  models: [],
  color: [0, 0, 0],
  air,
});

describe('rotatedSize', () => {
  it('swaps X/Z on odd turns only', () => {
    expect(rotatedSize(SIZE, 0)).toEqual([3, 2, 5]);
    expect(rotatedSize(SIZE, 1)).toEqual([5, 2, 3]);
    expect(rotatedSize(SIZE, 2)).toEqual([3, 2, 5]);
    expect(rotatedSize(SIZE, 3)).toEqual([5, 2, 3]);
  });
});

describe('rotateCell', () => {
  it('keeps every cell inside the rotated box and stays a bijection', () => {
    for (const turns of TURNS) {
      const [W, H, D] = rotatedSize(SIZE, turns);
      const seen = new Set<string>();
      for (let x = 0; x < SIZE[0]; x++)
        for (let y = 0; y < SIZE[1]; y++)
          for (let z = 0; z < SIZE[2]; z++) {
            const [rx, ry, rz] = rotateCell([x, y, z], SIZE, turns);
            expect(rx).toBeGreaterThanOrEqual(0);
            expect(rx).toBeLessThan(W);
            expect(ry).toBeGreaterThanOrEqual(0);
            expect(ry).toBeLessThan(H);
            expect(rz).toBeGreaterThanOrEqual(0);
            expect(rz).toBeLessThan(D);
            seen.add(`${rx},${ry},${rz}`);
          }
      expect(seen.size).toBe(SIZE[0] * SIZE[1] * SIZE[2]);
    }
  });

  it('four turns compose back to the identity', () => {
    // 1 turn of the rotated frame twice = 2 turns of the original, etc.
    const once = rotateCell([2, 0, 1], SIZE, 1);
    const twice = rotateCell(once, rotatedSize(SIZE, 1), 1);
    expect(twice).toEqual(rotateCell([2, 0, 1], SIZE, 2));
  });
});

describe('ghostTransform matches rotateCell', () => {
  it('rotating a block CENTER by the group transform lands in the rotateCell cell', () => {
    for (const turns of TURNS) {
      const { rotationY, offset } = ghostTransform(SIZE, turns);
      const cos = Math.round(Math.cos(rotationY));
      const sin = Math.round(Math.sin(rotationY));
      for (const cell of [
        [0, 0, 0],
        [2, 1, 4],
        [1, 0, 3],
      ] as const) {
        const cx = cell[0] + 0.5;
        const cz = cell[2] + 0.5;
        // Three.js rotation about +Y: x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ.
        const wx = cx * cos + cz * sin + offset[0];
        const wz = -cx * sin + cz * cos + offset[2];
        expect([Math.floor(wx), cell[1], Math.floor(wz)]).toEqual(rotateCell(cell, SIZE, turns));
      }
    }
  });
});

describe('planPlacement', () => {
  const palette = [
    entry('minecraft:stone'),
    entry('minecraft:oak_stairs', { facing: 'east', half: 'bottom' }),
    entry('minecraft:air', undefined, true),
    entry('minecraft:structure_void', undefined, true),
  ];
  const blocks: StructureBlock[] = [
    { state: 0, pos: [0, 0, 0] },
    { state: 1, pos: [1, 0, 0] },
    { state: 2, pos: [2, 0, 0] },
    { state: 3, pos: [0, 1, 0] },
  ];
  const data = { size: [3, 2, 1] as Vec3, palette, blocks };

  it('offsets by the anchor and skips structure_void (omitted cells produce no edit)', () => {
    const plan = planPlacement(data, [10, 64, -5], 0);
    expect(plan.edits).toHaveLength(3); // stone + stairs + air — the void cell is dropped
    expect(plan.edits[0]).toMatchObject({ x: 10, y: 64, z: -5, name: 'minecraft:stone' });
  });

  it('keeps explicit air as a clearing edit', () => {
    const plan = planPlacement(data, [0, 0, 0], 0);
    expect(plan.edits.find((e) => e.x === 2)?.name).toBe('minecraft:air');
  });

  it('rewrites directional blockstates for the rotation (CW: east → south)', () => {
    const plan = planPlacement(data, [0, 0, 0], 1);
    const stairs = plan.edits.find((e) => e.name === 'minecraft:oak_stairs');
    expect(stairs?.properties).toMatchObject({ facing: 'south', half: 'bottom' });
    // Position rotated too: local [1,0,0] in a 3×2×1 box, 1 CW turn → [D-1-z, y, x] = [0,0,1].
    expect([stairs?.x, stairs?.y, stairs?.z]).toEqual([0, 0, 1]);
  });

  it('collects each unique solid state once (air needs no resolution)', () => {
    const plan = planPlacement(data, [0, 0, 0], 0);
    expect([...plan.states.keys()].sort()).toEqual([
      'minecraft:oak_stairs[facing=east,half=bottom]',
      'minecraft:stone',
    ]);
    expect(plan.states.get('minecraft:stone')?.sourceState).toBe(0);
  });

  it('carries the cell block-entity NBT onto its (rotated) edit', () => {
    const chest = { pos: [0, 0, 0] as Vec3, id: 'minecraft:chest', nbt: { Items: [{ Slot: 0, id: 'minecraft:diamond', Count: 3 }] } };
    const plan = planPlacement({ ...data, blockEntities: [chest] }, [10, 64, -5], 1);
    // Local [0,0,0] in a 3×2×1 box, 1 CW turn → [D-1-z, y, x] = [0,0,0]; anchor offsets it.
    const edit = plan.edits.find((e) => e.blockEntity);
    expect([edit?.x, edit?.y, edit?.z]).toEqual([10, 64, -5]);
    expect(edit?.name).toBe('minecraft:stone');
    expect(edit?.blockEntity).toMatchObject({ id: 'minecraft:chest', Items: [{ Slot: 0, id: 'minecraft:diamond', Count: 3 }] });
  });

  it('maps entities to rotated absolute positions with rotated yaw', () => {
    const stand = { pos: [0.5, 0, 0.5] as Vec3, nbt: { id: 'minecraft:armor_stand', Rotation: [0, 0] } };
    const plan = planPlacement({ ...data, rawEntities: [stand] }, [10, 64, -5], 1);
    expect(plan.entities).toHaveLength(1);
    // Continuous [0.5,0,0.5] in a 3×2×1 box, 1 CW turn → [D - z, y, x] = [0.5, 0, 0.5].
    expect(plan.entities[0].pos).toEqual([10.5, 64, -4.5]);
    // Yaw 0 = south; a CW turn faces it west (+90), matching the blockstate rewrite.
    expect(plan.entities[0].nbt.Rotation).toEqual([90, 0]);
  });
});

describe('rotatePoint', () => {
  it('agrees with rotateCell on block centers', () => {
    for (const turns of TURNS) {
      for (const cell of [
        [0, 0, 0],
        [2, 1, 4],
        [1, 0, 3],
      ] as const) {
        const p = rotatePoint([cell[0] + 0.5, cell[1], cell[2] + 0.5], SIZE, turns);
        expect([Math.floor(p[0]), p[1], Math.floor(p[2])]).toEqual(rotateCell(cell, SIZE, turns));
      }
    }
  });
});

describe('rotateEntityNbt', () => {
  it('normalizes yaw into (-180, 180] and leaves pitch alone', () => {
    expect(rotateEntityNbt({ Rotation: [170, 10] }, 1).Rotation).toEqual([-100, 10]);
    expect(rotateEntityNbt({ Rotation: [-90, 0] }, 2).Rotation).toEqual([90, 0]);
  });

  it('rotates hanging-entity facing (item frame: north→east; painting: south→west)', () => {
    expect(rotateEntityNbt({ id: 'minecraft:item_frame', Facing: 2 }, 1).Facing).toBe(5);
    expect(rotateEntityNbt({ id: 'minecraft:item_frame', Facing: 1 }, 1).Facing).toBe(1); // up stays
    expect(rotateEntityNbt({ id: 'minecraft:painting', facing: 0 }, 1).facing).toBe(1);
  });

  it('is the identity at zero turns (same reference — no copies for the common case)', () => {
    const nbt = { id: 'minecraft:cow', Rotation: [45, 0] };
    expect(rotateEntityNbt(nbt, 0)).toBe(nbt);
  });
});
