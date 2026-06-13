// The ground-floor level ("grade") from a build's labelled storeys — the single
// stable signal the air-fill uses to split exterior empty space into:
//   • below grade  → omitted (= structure_void): placement preserves the terrain
//     around/under the basement (no trench gouged in front of it),
//   • at/above grade → air: the recessed facade and balcony stay visible & walkable
//     even when the build conflicts with the world.
//
// Stable by design: it reads the declared floor roles (the model marks them per emit;
// the user's Floor plan overrides) instead of guessing from geometry — which breaks
// once basements grow large and gain their own doors.
import type { FloorRole } from '@/shared/types';

/** A role-tagged inclusive y range — the shape both the AI's `AuthoringFloor` and the
 *  user's `FloorDef` satisfy, so `gradeFromFloors` accepts either. */
export interface FloorRange {
  from: number;
  to: number;
  role?: FloorRole;
}

/** The WALKABLE floor-slab y of each storey (the level you stand on), ascending — every
 *  labelled floor except the roof band (which isn't a storey you walk a connector up to).
 *  Fed to the stairwell pass as authoritative planes so a code-built build's storeys are
 *  recognised even when a big YARD ground plane at grade dwarfs them under the geometric
 *  60%-of-busiest cut (the "stairs broke once the house got a yard" defect). */
export function storeyPlanesFromFloors(floors: FloorRange[] | undefined): number[] {
  if (!floors?.length) return [];
  return [...new Set(floors.filter((f) => f.role !== 'roof').map((f) => Math.min(f.from, f.to)))].sort((a, b) => a - b);
}

/** The grade y from labelled storeys: the lowest `from` among non-basement floors
 *  (the ground floor sits just above the basement). If every floor is a basement,
 *  grade is one above the highest one. Returns `undefined` when there are no floors —
 *  the caller then voids nothing (every exterior pocket fills with air, the behaviour
 *  before floor marking existed). */
export function gradeFromFloors(floors: FloorRange[] | undefined): number | undefined {
  if (!floors?.length) return undefined;
  const aboveGrade = floors.filter((f) => f.role !== 'basement');
  if (aboveGrade.length) return Math.min(...aboveGrade.map((f) => Math.min(f.from, f.to)));
  return Math.max(...floors.map((f) => Math.max(f.from, f.to))) + 1;
}
