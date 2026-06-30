// The sakura cottage's raised-entry contract: the recessed door is a SEALED exterior
// alcove (side walls, stone backing below the door plane, a soffit over the porch), so
// the door is the real in/out boundary — never a freestanding stub the interior can walk
// around (the "a porta ficou pra dentro" defect). And the visible stone basement vents
// are ALWAYS iron bars, never glass panes (the below-grade opening rule).
import { describe, expect, it } from 'vitest';
import { resolveBlocks } from '../../../authoring/ops';
import type { AuthoringStructure } from '../../../authoring/types';

/** Expand the sakura template to a pos→block-name grid (pre-pass — the shell as laid). */
function grid(size: [number, number, number], params: Record<string, unknown>) {
  const authoring: AuthoringStructure = {
    DataVersion: 3955,
    size,
    palette: [{ Name: 'minecraft:air' }],
    ops: [{ op: 'template', name: 'raised-cottage', from: [0, 0, 0], to: [size[0] - 1, size[1] - 1, size[2] - 1], params }],
  };
  const resolved = resolveBlocks(authoring);
  const cells = new Map<string, string>();
  for (const b of resolved.blocks) cells.set(b.pos.join(','), resolved.palette[b.state]?.Name ?? '');
  const at = (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? 'minecraft:air';
  const solid = (x: number, y: number, z: number) =>
    !['minecraft:air', 'minecraft:structure_void'].includes(at(x, y, z));
  return { at, solid };
}

describe('sakura raised entry', () => {
  // 16×16×29 → baseH=3, mainY=3, run=3, entryZ=3, cx=7 (see plan() in sakura.ts).
  const { at, solid } = grid([16, 16, 29], { decoration: 'sakura', floors: 2 });

  it('seats the door in the recessed facade with the climb open in front', () => {
    expect(at(7, 4, 3)).toBe('minecraft:cherry_door');
    expect(at(7, 5, 3)).toBe('minecraft:cherry_door');
    expect(at(7, 4, 1)).toBe('minecraft:air'); // the open climb bay
  });

  it('seals the alcove: side walls, soffit, and stone behind/below the door plane', () => {
    for (const sx of [5, 9]) {
      for (let z = 1; z <= 3; z++) {
        for (let y = 1; y <= 6; y++) expect(solid(sx, y, z), `side ${sx},${y},${z}`).toBe(true);
      }
    }
    // The cellar never opens into the exterior stair shaft.
    for (let x = 6; x <= 8; x++) {
      for (let y = 1; y <= 2; y++) expect(solid(x, y, 3), `backing ${x},${y},3`).toBe(true);
    }
    // The room above never looks down into the porch.
    for (let x = 6; x <= 8; x++) {
      for (let z = 1; z <= 3; z++) expect(solid(x, 6, z), `soffit ${x},6,${z}`).toBe(true);
    }
  });

  it('vents the visible stone basement with iron bars, never glass', () => {
    expect(at(0, 1, 14)).toBe('minecraft:iron_bars');
    expect(at(15, 1, 14)).toBe('minecraft:iron_bars');
    expect(at(7, 1, 28)).toBe('minecraft:iron_bars');
  });
});
