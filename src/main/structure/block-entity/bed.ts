// Beds: a bed's blockstate model is particle-only — vanilla renders it as a
// block entity from a per-color 64x64 atlas (`entity/bed/<color>.png`). A bed is
// two blocks: a `head` half (pillow + headboard) and a `foot` half, each placed
// in its own cell. We synthesize the mattress slab + two legs for whichever half
// this block is, with box-UV mapping that matches the vanilla atlas layout.
//
// The atlas is the standard Minecraft box unwrap of the mattress box
// (16×16×6, laid flat). For each half at vertical offset `v` (head 0, foot 22):
//   - the 16×16 "front" region (6,6) is the mattress TOP — for the head its
//     upper half is the pillow, lower half the blanket;
//   - the 16×6 "up" region (6,0) is the half's OUTER end cap (head/footboard);
//   - the 6×16 side regions (0,6) / (22,6) are the long sides.
// Canonical orientation (facing=south): the head's outer end faces +z, the
// foot's outer end faces -z; FACING_Y rotates the whole model.
import type { FaceDir, ModelElement, ModelFace, ResolvedModel } from '@/shared/types';
import { parseRef } from '../model-loader';
import { boxFaces, FACING_Y, rect, textureExists, type Vec3 } from './box-uv';

const MATTRESS_FROM: Vec3 = [0, 3, 0];
const MATTRESS_TO: Vec3 = [16, 9, 16];

function face(texture: string, uv: [number, number, number, number], rotation?: number): ModelFace {
  return { texture, uv, rotation };
}

/** Mattress faces for the head half (outer/pillow end toward +z south). */
function headMattress(texture: string): Partial<Record<FaceDir, ModelFace>> {
  return {
    // Top: flip V so the pillow (atlas rows 6-13) lands on the +z outer end.
    up: face(texture, rect(6, 22, 22, 6)),
    down: face(texture, rect(28, 6, 44, 22)),
    south: face(texture, rect(6, 6, 22, 0)), // outer headboard cap (frame strip at the bottom)
    north: face(texture, rect(22, 6, 38, 0)), // inner end (hidden against the foot)
    // Long sides: frame strip along the bottom edge, pillow-white at the +z (head) end.
    west: face(texture, rect(6, 6, 0, 22), 90),
    east: face(texture, rect(22, 22, 28, 6), 90),
  };
}

/** Mattress faces for the foot half (outer footboard toward -z north). */
function footMattress(texture: string): Partial<Record<FaceDir, ModelFace>> {
  return {
    up: face(texture, rect(6, 28, 22, 44)),
    down: face(texture, rect(28, 28, 44, 44)),
    north: face(texture, rect(22, 28, 38, 22)), // outer footboard cap (frame strip at the bottom)
    south: face(texture, rect(6, 28, 22, 22)), // inner end (hidden against the head)
    // Long sides: frame strip along the bottom edge (foot half is uniform red).
    west: face(texture, rect(6, 28, 0, 44), 90),
    east: face(texture, rect(22, 28, 28, 44), 90),
  };
}

/** A 3×3×3 leg at the given footprint corner (xMin, zMin), atlas offset (u,v). */
function leg(texture: string, xMin: number, zMin: number, u: number, v: number): ModelElement {
  const from: Vec3 = [xMin, 0, zMin];
  const to: Vec3 = [xMin + 3, 3, zMin + 3];
  return { from, to, faces: boxFaces(from, to, texture, u, v) };
}

function headElements(texture: string): ModelElement[] {
  return [
    { from: MATTRESS_FROM, to: MATTRESS_TO, faces: headMattress(texture) },
    leg(texture, 0, 13, 50, 6), // headboard-end corners (+z)
    leg(texture, 13, 13, 50, 18),
  ];
}

function footElements(texture: string): ModelElement[] {
  return [
    { from: MATTRESS_FROM, to: MATTRESS_TO, faces: footMattress(texture) },
    leg(texture, 0, 0, 50, 0), // footboard-end corners (-z)
    leg(texture, 13, 0, 50, 12),
  ];
}

/** Pick the per-color bed atlas texture, preferring the block's own namespace
 *  (modded beds) and falling back to the matching vanilla color. */
function bedTexture(namespace: string, color: string): string {
  const own = `${namespace}/entity/bed/${color}`;
  return textureExists(own) ? own : `minecraft/entity/bed/${color}`;
}

/** Resolve a `<color>_bed` block into a synthesized half (head/foot), or null. */
export function resolveBed(name: string, properties: Record<string, string>): ResolvedModel[] | null {
  const { namespace, path: key } = parseRef(name);
  const m = /^(.+)_bed$/.exec(key);
  if (!m) return null;

  const texture = bedTexture(namespace, m[1]);
  const elements = properties.part === 'foot' ? footElements(texture) : headElements(texture);
  const y = FACING_Y[properties.facing] ?? 0;
  return [{ elements, y }];
}
