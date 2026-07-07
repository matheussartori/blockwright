// Pure placement math for "Place structure into world": map an open structure's blocks
// into pending world edits at an anchor + rotation, with each directional blockstate
// rewritten for the rotation (via the shared `transformProps`) so stairs/doors/rails land
// facing right — the transform WorldEdit never fixed. No Three.js, no IO — unit-tested in
// __tests__/place.test.ts. The ghost preview and the commit share THIS mapping
// (`ghostTransform` ⇄ `rotateCell`), so what the ghost shows is exactly what lands.
import type { StructureData } from '@/shared/types';
import { transformProps } from '@/shared/structure/orientation';
import { AIR, stateKeyOf, type PendingWorldEdit } from './edit-overlay';

/** Clockwise quarter-turns about +Y — the `transformProps` rotate convention. */
export type PlaceTurns = 0 | 1 | 2 | 3;

export type Vec3 = [number, number, number];

/** The structure's bounding box after `turns` — odd turns swap X and Z. */
export function rotatedSize(size: Vec3, turns: PlaceTurns): Vec3 {
  return turns % 2 === 1 ? [size[2], size[1], size[0]] : [size[0], size[1], size[2]];
}

/** Rotate a local cell CW about +Y and re-normalize so the rotated box's min corner is
 *  back at the origin — world cells are `anchor + rotateCell(...)`. */
export function rotateCell(cell: readonly number[], size: Vec3, turns: PlaceTurns): Vec3 {
  const [x, y, z] = cell;
  const [W, , D] = size;
  switch (turns) {
    case 1: return [D - 1 - z, y, x];
    case 2: return [W - 1 - x, y, D - 1 - z];
    case 3: return [z, y, W - 1 - x];
    default: return [x, y, z];
  }
}

/** The Three.js transform equivalent to `rotateCell`: rotate the mesh group by
 *  `rotationY` and shift it by `offset`, and every local block cube lands exactly on
 *  `anchor + rotateCell(cell)`. (CW turns = a negative Y rotation in Three's convention;
 *  the offset re-normalizes the rotated box's min corner to the group origin.) */
export function ghostTransform(size: Vec3, turns: PlaceTurns): { rotationY: number; offset: Vec3 } {
  const [W, , D] = size;
  const offset: Vec3 =
    turns === 1 ? [D, 0, 0] : turns === 2 ? [W, 0, D] : turns === 3 ? [0, 0, W] : [0, 0, 0];
  return { rotationY: (-turns * Math.PI) / 2, offset };
}

/** One unique solid block state a placement needs rendered: its (rotation-rewritten)
 *  NBT state plus the SOURCE palette index, so a failed resolution can fall back to the
 *  already-resolved source entry instead of refusing the placement. */
export interface PlaceBlockState {
  name: string;
  properties?: Record<string, string>;
  sourceState: number;
}

export interface PlacePlan {
  edits: PendingWorldEdit[];
  /** Unique SOLID states to resolve for the composite mesh, by state key (air needs none). */
  states: Map<string, PlaceBlockState>;
}

const VOID = 'minecraft:structure_void';

/**
 * Plan a placement: every structure block becomes a pending world edit at `anchor` +
 * its rotated local cell. Semantics match vanilla paste (and the structure editor's
 * Void tool): explicit air CLEARS the world cell, `structure_void` and OMITTED cells
 * leave the terrain untouched (they produce no edit).
 *
 * @param data   The structure's size/palette/blocks (the open doc's StructureData).
 * @param anchor World cell the ROTATED bounding box's min corner sits at.
 * @param turns  CW quarter-turns about +Y.
 * @returns The pending edits plus the unique solid states to resolve.
 */
export function planPlacement(
  data: Pick<StructureData, 'size' | 'palette' | 'blocks'>,
  anchor: Vec3,
  turns: PlaceTurns,
): PlacePlan {
  const edits: PendingWorldEdit[] = [];
  const states = new Map<string, PlaceBlockState>();
  // Rewrite each palette entry's props once, not per block.
  const rotated = data.palette.map((entry): { name: string; properties?: Record<string, string> } | null => {
    if (entry.name === VOID) return null; // terrain preserved
    if (entry.air) return { name: AIR }; // explicit air clears the cell
    const props =
      turns === 0
        ? entry.properties
        : (transformProps(entry.properties, { kind: 'rotate', turns }) as Record<string, string> | undefined);
    return { name: entry.name, ...(props && Object.keys(props).length ? { properties: props } : {}) };
  });
  for (const b of data.blocks) {
    const st = rotated[b.state];
    if (!st) continue;
    const [x, y, z] = rotateCell(b.pos, data.size, turns);
    edits.push({ x: anchor[0] + x, y: anchor[1] + y, z: anchor[2] + z, name: st.name, ...(st.properties ? { properties: st.properties } : {}) });
    if (st.name !== AIR) {
      const key = stateKeyOf(st.name, st.properties);
      if (!states.has(key)) states.set(key, { name: st.name, properties: st.properties, sourceState: b.state });
    }
  }
  return { edits, states };
}
