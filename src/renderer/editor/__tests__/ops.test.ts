import { describe, it, expect } from 'vitest';
import type { PaletteEntry, StructureBlock } from '@/shared/types';
import {
  airEntry,
  describeCell,
  voidMarkers,
  buildStairs,
  cellKey,
  cuboidCells,
  deleteSelection,
  extrudeSelection,
  fillVoidBox,
  floodFill,
  internEntry,
  mirrorCell,
  moveSelection,
  occupancy,
  placeBlock,
  placeCells,
  planTransform,
  recolorCell,
  replaceSelection,
  rethemeBlocks,
  selectBox,
  setVoidCell,
  type EditData,
} from '../ops';

const entry = (name: string, air = false, properties: Record<string, string> = {}): PaletteEntry => ({
  name,
  properties,
  models: [],
  color: [0, 0, 0],
  air,
});
const block = (state: number, pos: [number, number, number]): StructureBlock => ({ state, pos });

/** A 2×1×1 wall of stone with an air palette entry at index 1. */
const data = (): EditData => ({
  size: [3, 3, 3],
  palette: [entry('minecraft:stone'), entry('minecraft:air', true)],
  blocks: [block(0, [0, 0, 0]), block(0, [1, 0, 0])],
});

describe('cuboidCells', () => {
  it('lists every cell in the inclusive box regardless of corner order', () => {
    expect(cuboidCells([0, 0, 0], [1, 1, 0])).toEqual(['0,0,0', '0,1,0', '1,0,0', '1,1,0']);
    expect(cuboidCells([1, 0, 0], [0, 0, 0])).toEqual(['0,0,0', '1,0,0']);
  });
});

describe('occupancy / selectBox', () => {
  it('maps only non-air cells', () => {
    const d = data();
    d.blocks.push(block(1, [2, 0, 0])); // an air block — not selectable
    const occ = occupancy(d);
    expect([...occ.keys()].sort()).toEqual(['0,0,0', '1,0,0']);
  });
  it('box-select keeps only occupied cells in the cuboid', () => {
    expect(selectBox(data(), [0, 0, 0], [2, 0, 0]).sort()).toEqual(['0,0,0', '1,0,0']);
  });
});

describe('moveSelection', () => {
  it('shifts selected blocks and vacates the originals', () => {
    const r = moveSelection(data(), ['0,0,0', '1,0,0'], [0, 1, 0]);
    expect(r.blocks.map((b) => cellKey(b.pos)).sort()).toEqual(['0,1,0', '1,1,0']);
    expect(r.selection.sort()).toEqual(['0,1,0', '1,1,0']);
  });
  it('overwrites a non-selected block sitting in a target cell', () => {
    const d = data();
    d.blocks.push(block(0, [0, 1, 0])); // will be overwritten by the move up
    const r = moveSelection(d, ['0,0,0'], [0, 1, 0]);
    expect(r.blocks.filter((b) => cellKey(b.pos) === '0,1,0')).toHaveLength(1);
  });
});

describe('extrudeSelection', () => {
  it('raises a footprint into a wall (duplicates upward)', () => {
    const r = extrudeSelection(data(), ['0,0,0', '1,0,0'], 'y', 2);
    const keys = r.blocks.map((b) => cellKey(b.pos)).sort();
    expect(keys).toEqual(['0,0,0', '0,1,0', '0,2,0', '1,0,0', '1,1,0', '1,2,0']);
    expect(r.selection.sort()).toEqual(['0,0,0', '1,0,0']); // selection unchanged
  });
  it('extrudes in the negative direction for a negative count', () => {
    const r = extrudeSelection(data(), ['0,0,0'], 'x', -1);
    expect(r.blocks.some((b) => cellKey(b.pos) === '-1,0,0')).toBe(true);
  });
  it('makes a spaced array when step > 1 (gaps between copies)', () => {
    const r = extrudeSelection(data(), ['0,0,0'], 'y', 2, 3); // 2 copies, 3 cells apart
    const ys = r.blocks.filter((b) => b.pos[0] === 0).map((b) => b.pos[1]).sort((a, b) => a - b);
    expect(ys).toEqual([0, 3, 6]); // original + two copies at +3, +6
  });
});

describe('deleteSelection', () => {
  it('removes the selected blocks and clears the selection', () => {
    const r = deleteSelection(data(), ['0,0,0']);
    expect(r.blocks.map((b) => cellKey(b.pos))).toEqual(['1,0,0']);
    expect(r.selection).toEqual([]);
  });
});

describe('replaceSelection / internEntry', () => {
  it('interns the entry once and reuses it', () => {
    const p = [entry('minecraft:stone')];
    const a = internEntry(p, entry('minecraft:oak_planks'));
    expect(a.index).toBe(1);
    const b = internEntry(a.palette, entry('minecraft:oak_planks'));
    expect(b.index).toBe(1);
    expect(b.palette).toHaveLength(2);
  });
  it('swaps selected blocks to the new entry', () => {
    const r = replaceSelection(data(), ['0,0,0'], entry('minecraft:oak_planks'));
    const planks = r.palette.findIndex((p) => p.name === 'minecraft:oak_planks');
    expect(r.blocks.find((b) => cellKey(b.pos) === '0,0,0')?.state).toBe(planks);
    expect(r.blocks.find((b) => cellKey(b.pos) === '1,0,0')?.state).toBe(0); // untouched
  });
});

describe('planTransform', () => {
  const stairs = (facing: string): EditData => ({
    size: [3, 1, 3],
    palette: [entry('minecraft:oak_stairs', false, { facing })],
    blocks: [block(0, [0, 0, 0]), block(0, [1, 0, 0]), block(0, [2, 0, 0])],
  });

  it('mirrors across X and flips facing east↔west', () => {
    const out = planTransform(stairs('east'), ['0,0,0', '2,0,0'], { kind: 'mirror', axis: 'x' });
    const facingByPos = new Map(out.map((p) => [cellKey(p.pos), p.props.facing]));
    expect(facingByPos.get('2,0,0')).toBe('west'); // (0,0,0) reflected to x=2
    expect(facingByPos.get('0,0,0')).toBe('west'); // (2,0,0) reflected to x=0
  });

  it('rotates 90° CW about the centre and turns facing east→south', () => {
    const out = planTransform(stairs('east'), ['0,0,0', '1,0,0', '2,0,0'], { kind: 'rotate', turns: 1 });
    expect(out.map((p) => cellKey(p.pos)).sort()).toEqual(['1,0,-1', '1,0,0', '1,0,1']); // X-line → Z-line
    expect(out[0].props.facing).toBe('south');
  });
});

describe('block-entity NBT link (nbtPos)', () => {
  // A data-mode structure block's NBT (mode/metadata) is re-attached on save via the
  // block's ORIGIN cell — every op that keeps or copies a block must carry `nbtPos`,
  // or a moved marker exports as a bare, non-functional structure block.
  const marked = (): EditData => {
    const d = data();
    d.blocks[0] = { ...d.blocks[0], nbtPos: [0, 0, 0] };
    return d;
  };

  it('moveSelection carries nbtPos to the new cell', () => {
    const r = moveSelection(marked(), ['0,0,0'], [0, 1, 0]);
    expect(r.blocks.find((b) => cellKey(b.pos) === '0,1,0')?.nbtPos).toEqual([0, 0, 0]);
  });

  it('extrudeSelection copies inherit nbtPos', () => {
    const r = extrudeSelection(marked(), ['0,0,0'], 'y', 1);
    expect(r.blocks.find((b) => cellKey(b.pos) === '0,1,0')?.nbtPos).toEqual([0, 0, 0]);
  });

  it('replaceSelection keeps nbtPos on the in-place swap', () => {
    const r = replaceSelection(marked(), ['0,0,0'], entry('minecraft:oak_planks'));
    expect(r.blocks.find((b) => cellKey(b.pos) === '0,0,0')?.nbtPos).toEqual([0, 0, 0]);
  });

  it('planTransform placements carry nbtPos through a mirror', () => {
    const d = marked();
    const out = planTransform(d, ['0,0,0', '1,0,0'], { kind: 'mirror', axis: 'x' });
    const moved = out.find((p) => cellKey(p.pos) === '1,0,0'); // (0,0,0) reflected to x=1
    expect(moved?.nbtPos).toEqual([0, 0, 0]);
    expect(out.find((p) => cellKey(p.pos) === '0,0,0')?.nbtPos).toBeUndefined();
  });

  it('a fresh painted block has no nbtPos (stale NBT must not re-attach)', () => {
    const r = placeBlock(marked(), [0, 0, 0], entry('minecraft:glass'));
    expect(r.blocks.find((b) => cellKey(b.pos) === '0,0,0')?.nbtPos).toBeUndefined();
  });

  it('an edited data-marker string (dataMeta) rides through move and transform', () => {
    const d = data();
    d.blocks[0] = { ...d.blocks[0], nbtPos: [0, 0, 0], dataMeta: 'arena_spawner' };
    const moved = moveSelection(d, ['0,0,0'], [0, 1, 0]);
    expect(moved.blocks.find((b) => cellKey(b.pos) === '0,1,0')?.dataMeta).toBe('arena_spawner');
    const out = planTransform(d, ['0,0,0', '1,0,0'], { kind: 'mirror', axis: 'x' });
    expect(out.find((p) => cellKey(p.pos) === '1,0,0')?.dataMeta).toBe('arena_spawner');
  });
});

describe('mirrorCell', () => {
  it('reflects a cell across the structure centre on X / Z', () => {
    expect(mirrorCell([0, 0, 0], 'x', [5, 1, 5])).toEqual([4, 0, 0]);
    expect(mirrorCell([0, 0, 1], 'z', [5, 1, 7])).toEqual([0, 0, 5]);
    expect(mirrorCell([1, 2, 3], 'z', [5, 9, 7])).toEqual([1, 2, 3]); // on the centre plane → unchanged
  });
});

describe('placeBlock', () => {
  it('adds (or overwrites) a block at the cell and selects it', () => {
    const r = placeBlock(data(), [2, 0, 0], entry('minecraft:glass'));
    expect(r.blocks.find((b) => cellKey(b.pos) === '2,0,0')?.state).toBe(r.palette.findIndex((p) => p.name === 'minecraft:glass'));
    expect(r.selection).toEqual(['2,0,0']);
  });
});

describe('placeCells', () => {
  it('places several blocks in one edit, interning each entry once', () => {
    const r = placeCells(data(), [
      { cell: [2, 0, 0], entry: entry('minecraft:glass') },
      { cell: [2, 1, 0], entry: entry('minecraft:glass') },
    ]);
    const glass = r.palette.findIndex((p) => p.name === 'minecraft:glass');
    expect(r.palette.filter((p) => p.name === 'minecraft:glass')).toHaveLength(1); // deduped
    expect(r.blocks.filter((b) => b.state === glass)).toHaveLength(2);
    expect(r.selection.sort()).toEqual(['2,0,0', '2,1,0']);
  });
  it('drops placements outside the NBT volume (locked to size)', () => {
    const r = placeCells(data(), [
      { cell: [1, 0, 0], entry: entry('minecraft:glass') }, // in bounds
      { cell: [3, 0, 0], entry: entry('minecraft:glass') }, // x == size[0] → out
      { cell: [0, 0, -1], entry: entry('minecraft:glass') }, // z < 0 → out
    ]);
    const placed = r.blocks.filter((b) => r.palette[b.state].name === 'minecraft:glass');
    expect(placed.map((b) => cellKey(b.pos))).toEqual(['1,0,0']);
    expect(r.selection).toEqual(['1,0,0']);
  });
  it('is a no-op when every placement is out of bounds', () => {
    const r = placeCells(data(), [{ cell: [3, 3, 3], entry: entry('minecraft:glass') }]);
    expect(r.palette.some((p) => p.name === 'minecraft:glass')).toBe(false);
    expect(r.selection).toEqual([]);
  });
});

describe('recolorCell', () => {
  it('repaints the existing block in place', () => {
    const r = recolorCell(data(), [0, 0, 0], entry('minecraft:oak_planks'));
    const planks = r!.palette.findIndex((p) => p.name === 'minecraft:oak_planks');
    expect(r!.blocks.find((b) => cellKey(b.pos) === '0,0,0')?.state).toBe(planks);
  });
  it('is a no-op on an empty cell (nothing to recolor)', () => {
    expect(recolorCell(data(), [2, 2, 2], entry('minecraft:oak_planks'))).toBeNull();
  });
});

describe('setVoidCell', () => {
  it('marks an empty cell as air without touching solids', () => {
    const r = setVoidCell(data(), [2, 0, 0], 'air');
    const air = r!.palette.findIndex((p) => p.name === 'minecraft:air');
    expect(r!.blocks.find((b) => cellKey(b.pos) === '2,0,0')?.state).toBe(air);
  });
  it('marks structure void with the right block', () => {
    const r = setVoidCell(data(), [2, 0, 0], 'void');
    expect(r!.palette.some((p) => p.name === 'minecraft:structure_void')).toBe(true);
  });
  it('refuses to overwrite a solid block', () => {
    expect(setVoidCell(data(), [0, 0, 0], 'air')).toBeNull();
  });
  it('refuses a cell outside the NBT volume (locked to size)', () => {
    expect(setVoidCell(data(), [3, 0, 0], 'air')).toBeNull();
    expect(setVoidCell(data(), [0, -1, 0], 'void')).toBeNull();
  });
  it('switches an existing air marker to structure void', () => {
    const d = data();
    d.blocks.push(block(1, [2, 0, 0])); // an air marker at index 1
    const r = setVoidCell(d, [2, 0, 0], 'void');
    const st = r!.blocks.find((b) => cellKey(b.pos) === '2,0,0')!.state;
    expect(r!.palette[st].name).toBe('minecraft:structure_void');
  });
});

describe('rethemeBlocks', () => {
  it('remaps every block of a palette entry, keeping position / nbtPos / dataMeta', () => {
    const d: EditData = {
      size: [3, 1, 1],
      palette: [entry('minecraft:oak_stairs', false, { facing: 'east' }), entry('minecraft:dirt')],
      blocks: [
        { state: 0, pos: [0, 0, 0], nbtPos: [0, 0, 0], dataMeta: 'spawn' },
        { state: 0, pos: [1, 0, 0] },
        { state: 1, pos: [2, 0, 0] },
      ],
    };
    // The resolved replacement carries the SOURCE's properties (the caller resolves it so).
    const target = entry('minecraft:spruce_stairs', false, { facing: 'east' });
    const r = rethemeBlocks(d, new Map([[0, target]]))!;
    const spruce = r.palette.findIndex((p) => p.name === 'minecraft:spruce_stairs');
    expect(spruce).toBeGreaterThanOrEqual(0);
    expect(r.palette[spruce].properties).toEqual({ facing: 'east' });
    const swapped = r.blocks.filter((b) => b.state === spruce);
    expect(swapped).toHaveLength(2);
    const withNbt = swapped.find((b) => b.pos[0] === 0)!;
    expect(withNbt.nbtPos).toEqual([0, 0, 0]);
    expect(withNbt.dataMeta).toBe('spawn');
    expect(r.blocks.find((b) => b.pos[0] === 2)?.state).toBe(1); // dirt untouched
  });

  it('is a no-op for an empty mapping', () => {
    expect(rethemeBlocks(data(), new Map())).toBeNull();
  });
});

describe('fillVoidBox', () => {
  /** A 3×3×3 box with solid corners at (0,0,0) and (2,2,2) plus one air marker inside. */
  const boxData = (): EditData => ({
    size: [3, 3, 3],
    palette: [entry('minecraft:stone'), entry('minecraft:air', true)],
    blocks: [block(0, [0, 0, 0]), block(0, [2, 2, 2]), block(1, [1, 1, 1])],
  });

  it('fills every non-solid cell of the selection bounding box in one step', () => {
    const r = fillVoidBox(boxData(), ['0,0,0', '2,2,2'], 'void');
    const voidIdx = r!.palette.findIndex((p) => p.name === 'minecraft:structure_void');
    const voids = r!.blocks.filter((b) => b.state === voidIdx);
    expect(voids).toHaveLength(27 - 2); // the whole box minus the two solids
    // Solids preserved, existing air converted, selection kept.
    expect(r!.blocks.find((b) => cellKey(b.pos) === '0,0,0')?.state).toBe(0);
    expect(r!.blocks.find((b) => cellKey(b.pos) === '2,2,2')?.state).toBe(0);
    expect(r!.blocks.find((b) => cellKey(b.pos) === '1,1,1')?.state).toBe(voidIdx);
    expect(r!.selection).toEqual(['0,0,0', '2,2,2']);
  });

  it('fills with air when asked', () => {
    const r = fillVoidBox(boxData(), ['0,0,0', '2,2,2'], 'air');
    const airIdx = r!.palette.findIndex((p) => p.name === 'minecraft:air');
    expect(r!.blocks.filter((b) => b.state === airIdx)).toHaveLength(25);
  });

  it('is a no-op without a selection', () => {
    expect(fillVoidBox(boxData(), [], 'void')).toBeNull();
  });

  it('clamps the box to the NBT volume', () => {
    // A single-cell selection at the corner — box is that one (solid) cell → nothing to write.
    expect(fillVoidBox(boxData(), ['0,0,0'], 'void')).toBeNull();
  });
});

describe('floodFill', () => {
  it('fills the connected region of the same block', () => {
    const d: EditData = {
      size: [3, 1, 1],
      palette: [entry('minecraft:stone'), entry('minecraft:dirt')],
      blocks: [block(0, [0, 0, 0]), block(0, [1, 0, 0]), block(1, [2, 0, 0])],
    };
    const r = floodFill(d, [0, 0, 0], entry('minecraft:glass'));
    const glass = r!.palette.findIndex((p) => p.name === 'minecraft:glass');
    expect(r!.blocks.filter((b) => b.state === glass).map((b) => cellKey(b.pos)).sort()).toEqual(['0,0,0', '1,0,0']);
    expect(r!.blocks.find((b) => cellKey(b.pos) === '2,0,0')?.state).toBe(1); // dirt untouched
  });
  it('is a no-op on an empty start cell', () => {
    expect(floodFill(data(), [2, 2, 2], entry('minecraft:glass'))).toBeNull();
  });
});

describe('voidMarkers', () => {
  it('keeps only air/void cells adjacent to a solid (the editable boundary, not the fog)', () => {
    const d: EditData = {
      size: [4, 1, 1],
      palette: [entry('minecraft:stone'), entry('minecraft:air', true), entry('minecraft:structure_void', true)],
      blocks: [
        block(0, [0, 0, 0]), // solid
        block(1, [1, 0, 0]), // air touching the solid → shown
        block(1, [3, 0, 0]), // air far from any solid → hidden (would be fog)
        block(2, [0, 0, 1]), // structure_void? actually out of the line; touches the solid at 0,0,0
      ],
    };
    const m = voidMarkers(d);
    const byKey = new Map(m.map((v) => [v.key, v.kind]));
    expect(byKey.get('1,0,0')).toBe('air');
    expect(byKey.has('3,0,0')).toBe(false); // isolated air dropped
    expect(byKey.get('0,0,1')).toBe('void'); // structure_void next to the solid
  });
  it('always shows structure_void, even far from any solid (it is intentional)', () => {
    const d: EditData = {
      size: [6, 1, 1],
      palette: [entry('minecraft:stone'), entry('minecraft:structure_void', true)],
      blocks: [block(0, [0, 0, 0]), block(1, [5, 0, 0])], // void isolated at the far end
    };
    expect(voidMarkers(d).map((v) => v.key)).toContain('5,0,0');
  });
  it('shows OMITTED cells of a dense capture as void (terrain-preserving carve-outs)', () => {
    const d: EditData = {
      size: [1, 1, 3],
      palette: [entry('minecraft:stone')],
      blocks: [block(0, [0, 0, 0]), block(0, [0, 0, 1])], // [0,0,2] omitted, dense (2/3 > 0.5)
    };
    expect(voidMarkers(d)).toEqual([{ key: '0,0,2', kind: 'void' }]);
  });
  it('does NOT treat omitted cells of a SPARSE build as void (just empty space)', () => {
    const d: EditData = {
      size: [1, 1, 5],
      palette: [entry('minecraft:stone')],
      blocks: [block(0, [0, 0, 0])], // 1/5 < 0.5 → sparse, omitted is just empty
    };
    expect(voidMarkers(d)).toEqual([]);
  });
  it('reveals bulk air when editing (revealAir), still boundary-only', () => {
    const blocks: StructureBlock[] = [block(0, [0, 0, 0])];
    for (let i = 0; i < 300; i++) blocks.push(block(1, [1, 0, i])); // 300 air, only [1,0,0] touches the solid
    const d: EditData = {
      size: [2, 1, 301],
      palette: [entry('minecraft:stone'), entry('minecraft:air', true)],
      blocks,
    };
    expect(voidMarkers(d).length).toBe(0); // capped off by default
    const revealed = voidMarkers(d, true);
    expect(revealed.map((v) => v.key)).toEqual(['1,0,0']); // shown, but only the boundary cell
  });
  it('shows EVERY layer of a stacked structure_void region, interior cells tagged deep', () => {
    // One solid + a 5-cell void run behind it — the "only the first layer shows" defect.
    const d: EditData = {
      size: [7, 1, 1],
      palette: [entry('minecraft:stone'), entry('minecraft:structure_void', true)],
      blocks: [block(0, [0, 0, 0]), ...[1, 2, 3, 4, 5].map((x) => block(1, [x, 0, 0]))],
    };
    const m = voidMarkers(d);
    expect(m.map((v) => v.key).sort()).toEqual(['1,0,0', '2,0,0', '3,0,0', '4,0,0', '5,0,0']);
    const byKey = new Map(m.map((v) => [v.key, v.deep ?? false]));
    expect(byKey.get('1,0,0')).toBe(false); // touches the solid → full marker
    expect(byKey.get('2,0,0')).toBe(true); // interior layers → dimmed (deep)
    expect(byKey.get('5,0,0')).toBe(true);
  });
  it('reveals the interior of an omitted-dense void region only with revealAll', () => {
    const d: EditData = {
      size: [1, 1, 5],
      palette: [entry('minecraft:stone')],
      blocks: [block(0, [0, 0, 0]), block(0, [0, 0, 1]), block(0, [0, 0, 2])], // 3/5 dense; [0,0,3-4] omitted
    };
    expect(voidMarkers(d).map((v) => v.key)).toEqual(['0,0,3']); // boundary layer only
    const all = voidMarkers(d, false, true);
    const byKey = new Map(all.map((v) => [v.key, v.deep ?? false]));
    expect([...byKey.keys()].sort()).toEqual(['0,0,3', '0,0,4']);
    expect(byKey.get('0,0,3')).toBe(false);
    expect(byKey.get('0,0,4')).toBe(true);
  });
  it('reveals interior SPARSE air with revealAll, but never bulk air interiors', () => {
    // 3 listed cells in an 8-cell box → sparse (the dense-omitted rule stays out of play).
    const sparse: EditData = {
      size: [8, 1, 1],
      palette: [entry('minecraft:stone'), entry('minecraft:air', true)],
      blocks: [block(0, [0, 0, 0]), block(1, [1, 0, 0]), block(1, [2, 0, 0])],
    };
    expect(voidMarkers(sparse, true).map((v) => v.key)).toEqual(['1,0,0']); // boundary only
    expect(
      voidMarkers(sparse, true, true)
        .map((v) => v.key)
        .sort(),
    ).toEqual(['1,0,0', '2,0,0']);

    const blocks: StructureBlock[] = [block(0, [0, 0, 0])];
    for (let i = 0; i < 300; i++) blocks.push(block(1, [1, 0, i])); // bulk air
    const bulk: EditData = { size: [2, 1, 301], palette: [entry('minecraft:stone'), entry('minecraft:air', true)], blocks };
    expect(voidMarkers(bulk, true, true).map((v) => v.key)).toEqual(['1,0,0']); // interior stays hidden
  });
  it('drops bulk air (a captured .nbt) but keeps structure_void', () => {
    const blocks: StructureBlock[] = [block(0, [0, 0, 0])]; // one solid
    for (let i = 0; i < 300; i++) blocks.push(block(1, [1, 0, i])); // 300 air cells — bulk
    blocks.push(block(2, [1, 0, 0])); // a structure_void next to the solid
    const d: EditData = {
      size: [2, 1, 301],
      palette: [entry('minecraft:stone'), entry('minecraft:air', true), entry('minecraft:structure_void', true)],
      blocks,
    };
    const kinds = voidMarkers(d).map((v) => v.kind);
    expect(kinds).not.toContain('air'); // bulk air suppressed (no fog)
    expect(kinds).toContain('void'); // structure_void still shown
  });
});

describe('describeCell', () => {
  it('names a solid block, and tells air / void / empty apart', () => {
    const d: EditData = {
      size: [4, 1, 1],
      palette: [entry('minecraft:stone'), entry('minecraft:air', true), entry('minecraft:structure_void', true)],
      blocks: [block(0, [0, 0, 0]), block(1, [1, 0, 0]), block(2, [2, 0, 0])],
    };
    expect(describeCell(d, [0, 0, 0])).toEqual({ kind: 'block', name: 'minecraft:stone' });
    expect(describeCell(d, [1, 0, 0])).toEqual({ kind: 'air' });
    expect(describeCell(d, [2, 0, 0])).toEqual({ kind: 'void' });
    expect(describeCell(d, [3, 0, 0])).toEqual({ kind: 'empty' });
  });
});

describe('airEntry', () => {
  it('builds an air-flagged palette entry with no models', () => {
    const e = airEntry('minecraft:structure_void');
    expect(e.air).toBe(true);
    expect(e.models).toEqual([]);
  });
});

describe('buildStairs', () => {
  it('places an ascending run, one up + one along per step', () => {
    const r = buildStairs(data(), [0, 0, 1], [1, 0, 0], 3, entry('minecraft:oak_stairs', false, { facing: 'east' }));
    const stairIdx = r.palette.findIndex((p) => p.name === 'minecraft:oak_stairs');
    const placed = r.blocks.filter((b) => b.state === stairIdx).map((b) => cellKey(b.pos));
    expect(placed).toEqual(['0,0,1', '1,1,1', '2,2,1']);
  });
});
