// Pure placement math for "Place structure into world": map an open structure's blocks
// into pending world edits at an anchor + rotation, with each directional blockstate
// rewritten for the rotation (via the shared `transformProps`) so stairs/doors/rails land
// facing right — the transform WorldEdit never fixed. No Three.js, no IO — unit-tested in
// __tests__/place.test.ts. The ghost preview and the commit share THIS mapping
// (`ghostTransform` ⇄ `rotateCell`), so what the ghost shows is exactly what lands.
import type { StructureData, WorldEntityEdit } from '@/shared/types';
import { transformProps } from '@/shared/structure/orientation';
import { AIR, cellKeyOf, stateKeyOf, type PendingWorldEdit } from './edit-overlay';

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
  /** Entities to spawn at absolute world positions (rotated with the placement). */
  entities: WorldEntityEdit[];
}

/** Rotate a continuous structure-local point CW about +Y, re-normalized like `rotateCell`
 *  (the min corner of the rotated box back at the origin) — the entity-position analogue. */
export function rotatePoint(p: readonly number[], size: Vec3, turns: PlaceTurns): Vec3 {
  const [x, y, z] = p;
  const [W, , D] = size;
  switch (turns) {
    case 1: return [D - z, y, x];
    case 2: return [W - x, y, D - z];
    case 3: return [z, y, W - x];
    default: return [x, y, z];
  }
}

/** CW facing chains under one +Y quarter-turn (matches `rotateCell`: south→west→north→east). */
const PAINTING_FACING_CW = [1, 2, 3, 0]; // 0=south 1=west 2=north 3=east
const FRAME_FACING_CW: Record<number, number> = { 2: 5, 5: 3, 3: 4, 4: 2 }; // 2=north 3=south 4=west 5=east (0/1 = down/up fixed)

/**
 * Best-effort rotation of an entity compound for `turns` quarter-turns: yaw in `Rotation`
 * (+90° per CW turn — south→west, matching the block-property transform), and the hanging
 * entities' `facing`/`Facing` byte. Anything else rides through verbatim; `Pos`/Tile coords
 * are stamped by the write path from the final position.
 */
export function rotateEntityNbt(nbt: Record<string, unknown>, turns: PlaceTurns): Record<string, unknown> {
  if (turns === 0) return nbt;
  const out: Record<string, unknown> = { ...nbt };
  const rot = out.Rotation;
  if (Array.isArray(rot) && typeof rot[0] === 'number') {
    let yaw = (rot[0] + 90 * turns) % 360;
    if (yaw > 180) yaw -= 360;
    if (yaw < -180) yaw += 360;
    out.Rotation = [yaw, ...rot.slice(1)];
  }
  const id = typeof out.id === 'string' ? out.id : '';
  const facingKey = 'facing' in out ? 'facing' : 'Facing' in out ? 'Facing' : null;
  if (facingKey && typeof out[facingKey] === 'number') {
    const f = out[facingKey] as number;
    if (id.endsWith('painting')) {
      let next = f & 3;
      for (let i = 0; i < turns; i++) next = PAINTING_FACING_CW[next];
      out[facingKey] = next;
    } else if (id.endsWith('item_frame')) {
      let next = f;
      for (let i = 0; i < turns; i++) next = FRAME_FACING_CW[next] ?? next;
      out[facingKey] = next;
    }
  }
  return out;
}

const VOID = 'minecraft:structure_void';

/**
 * Plan a placement: every structure block becomes a pending world edit at `anchor` +
 * its rotated local cell. Semantics match vanilla paste (and the structure editor's
 * Void tool): explicit air CLEARS the world cell, `structure_void` and OMITTED cells
 * leave the terrain untouched (they produce no edit).
 *
 * Fidelity (§2.2): block-entity payloads ride on their cell's edit (a placed chest keeps
 * its contents) and entities land at their rotated absolute positions — both only when the
 * source doc carries them.
 *
 * @param data   The structure's size/palette/blocks (+ fidelity payloads when present).
 * @param anchor World cell the ROTATED bounding box's min corner sits at.
 * @param turns  CW quarter-turns about +Y.
 * @returns The pending edits plus the unique solid states to resolve and the entities.
 */
export function planPlacement(
  data: Pick<StructureData, 'size' | 'palette' | 'blocks' | 'blockEntities' | 'rawEntities'>,
  anchor: Vec3,
  turns: PlaceTurns,
): PlacePlan {
  const edits: PendingWorldEdit[] = [];
  const states = new Map<string, PlaceBlockState>();
  const beByCell = new Map<string, { id: string; nbt: Record<string, unknown> }>();
  for (const be of data.blockEntities ?? []) beByCell.set(cellKeyOf(be.pos[0], be.pos[1], be.pos[2]), be);
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
    const be = st.name !== AIR ? beByCell.get(cellKeyOf(b.pos[0], b.pos[1], b.pos[2])) : undefined;
    edits.push({
      x: anchor[0] + x,
      y: anchor[1] + y,
      z: anchor[2] + z,
      name: st.name,
      ...(st.properties ? { properties: st.properties } : {}),
      ...(be ? { blockEntity: { ...be.nbt, id: be.id } } : {}),
    });
    if (st.name !== AIR) {
      const key = stateKeyOf(st.name, st.properties);
      if (!states.has(key)) states.set(key, { name: st.name, properties: st.properties, sourceState: b.state });
    }
  }
  const entities: WorldEntityEdit[] = (data.rawEntities ?? []).map((e) => {
    const [x, y, z] = rotatePoint(e.pos, data.size, turns);
    return {
      pos: [anchor[0] + x, anchor[1] + y, anchor[2] + z],
      nbt: rotateEntityNbt(e.nbt, turns),
    };
  });
  return { edits, states, entities };
}
