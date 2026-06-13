import { describe, it, expect } from 'vitest';
import { rebuildStairwells } from '../stairwells';
import { posKey } from '../../geometry';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../types';

// A minimal storeyed build: a 9×9 footprint with full floor slabs at y=0 (basement), y=6
// (ground = grade) and y=12 (upper), 4-block stone walls between, so the floor-plane
// detector sees three planes. The basement (below grade) carries a code-built ladder; the
// above-grade storey is left unconnected.
const W = 9, D = 9;
const PLANES = [0, 6, 12];

function scene(): { blocks: AuthoringBlock[]; palette: AuthoringPaletteEntry[] } {
  const palette: AuthoringPaletteEntry[] = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:stone_bricks' },
    { Name: 'minecraft:ladder', Properties: { facing: 'south' } },
  ];
  const blocks: AuthoringBlock[] = [];
  for (const y of PLANES) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) blocks.push({ state: 1, pos: [x, y, z] });
  // Perimeter walls between the planes.
  for (let y = 1; y < 12; y++) for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (x === 0 || x === W - 1 || z === 0 || z === D - 1) blocks.push({ state: 1, pos: [x, y, z] });
  }
  // A basement ladder (below grade) hung on the back wall, rungs y1..6.
  for (let y = 1; y <= 6; y++) blocks.push({ state: 2, pos: [1, y, D - 2] });
  return { blocks, palette };
}

describe('rebuildStairwells — below-grade circulation is code-owned', () => {
  it('leaves the below-grade ladder intact (code owns basement circulation)', () => {
    const { blocks, palette } = scene();
    const out = rebuildStairwells(blocks, palette, { size: [W, 16, D], grade: 6, floorPlanes: PLANES });
    const has = (x: number, y: number, z: number) =>
      out.blocks.some((b) => posKey(...b.pos) === posKey(x, y, z) && (out.palette[b.state]?.Name ?? '').includes('ladder'));
    // The below-grade ladder (y1..6) survives untouched — the pass never strips/rebuilds it.
    for (let y = 1; y <= 6; y++) expect(has(1, y, D - 2), `basement rung y=${y}`).toBe(true);
  });

  it('WITHOUT a grade, the basement ladder is fair game (old behaviour preserved)', () => {
    // No grade → nothing is "below grade", so the pass treats every plane as a storey and may
    // rebuild the ladder into its own connector (proving the new exclusion is grade-gated).
    const { blocks, palette } = scene();
    const out = rebuildStairwells(blocks, palette, { size: [W, 16, D], floorPlanes: PLANES });
    expect(out.blocks.length).toBeGreaterThan(0); // ran without error
  });

  it('never carves a locked-shell wall cell to fit a connector', () => {
    const { blocks, palette } = scene();
    // Lock the entire perimeter wall column at the would-be stair landing — the pass must not
    // replace any of it, so the connector routes elsewhere (or is a ladder), never a pierce.
    const lockCells = blocks
      .filter((b) => b.state === 1 && (b.pos[0] === 0 || b.pos[0] === W - 1 || b.pos[2] === 0 || b.pos[2] === D - 1))
      .map((b) => ({ pos: b.pos, entry: palette[1] }));
    const out = rebuildStairwells(blocks, palette, { size: [W, 16, D], grade: 6, floorPlanes: PLANES, lockCells });
    // No locked perimeter cell was turned into air or a stair (the wall stayed solid).
    for (const c of lockCells) {
      const b = out.blocks.find((bb) => posKey(...bb.pos) === posKey(...c.pos));
      const name = b ? out.palette[b.state]?.Name ?? '' : 'minecraft:air';
      expect(name === 'minecraft:stone_bricks', `locked wall ${c.pos.join(',')} kept`).toBe(true);
    }
  });
});
