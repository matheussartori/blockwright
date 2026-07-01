// Storey-plane detection for the stairwell pass: which ys are walkable floor
// planes, and the house footprint a connector must stay inside.
import { isStructuralFull } from '../flights';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../types';

/** Detect the build's STOREY FLOOR planes: the y of each solid horizontal slab that
 *  spans most of the footprint. A real floor covers ~the whole plan, while interior
 *  partitions/furniture and a tapering gable roof fall below the 60%-of-busiest cut.
 *  Runs of consecutive plane-ys (a double-thick floor) collapse to their top y — the
 *  block you actually walk on — in `planes` (ascending); `runTop` maps EVERY member y
 *  of a run to that top, so a connector knows the lower slab of a double-thick floor
 *  is still carvable floor (not a protected wall) when it cuts its opening. */
export function floorPlanes(
  blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[],
): { planes: number[]; runTop: Map<number, number> } {
  const perY = new Map<number, number>();
  for (const b of blocks) {
    if (!isStructuralFull(palette, b.state)) continue;
    perY.set(b.pos[1], (perY.get(b.pos[1]) ?? 0) + 1);
  }
  if (perY.size === 0) return { planes: [], runTop: new Map() };
  const max = Math.max(...perY.values());
  const raw = [...perY.entries()].filter(([, c]) => c >= 0.6 * max).map(([y]) => y).sort((a, b) => a - b);
  // Collapse consecutive ys to the top of each run (the walkable surface block).
  const planes: number[] = [];
  const runTop = new Map<number, number>();
  let run: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    run.push(raw[i]);
    if (i + 1 < raw.length && raw[i + 1] === raw[i] + 1) continue;
    planes.push(raw[i]);
    for (const y of run) runTop.set(y, raw[i]);
    run = [];
  }
  return { planes, runTop };
}

/** Merge the AUTHORITATIVE storey planes (from the build's labelled floors, threaded via
 *  `ctx.floorPlanes`) into the geometric detection — the union, with each added plane
 *  mapped to ITSELF in `runTop` (a single-thickness slab). So a storey the 60%-of-busiest
 *  cut missed — a house with a big yard whose grade plane dwarfs the floors, or any porous
 *  build — is still recognised and connected, without losing the geometric double-thick
 *  floor info the carve logic relies on. No authoritative planes → geometric result as-is. */
export function mergedPlanes(
  geo: { planes: number[]; runTop: Map<number, number> },
  authoritative: number[] | undefined,
): { planes: number[]; runTop: Map<number, number> } {
  if (!authoritative?.length) return geo;
  const runTop = new Map(geo.runTop);
  const set = new Set(geo.planes);
  for (const y of authoritative) {
    if (!set.has(y)) set.add(y);
    if (!runTop.has(y)) runTop.set(y, y);
  }
  return { planes: [...set].sort((a, b) => a - b), runTop };
}

/** The largest 4-connected component of the structural-full FLOOR cells on plane `py`,
 *  as a bbox + size. Using the LARGEST component (not the raw bbox) rejects a handful of
 *  stray cells at that level — a stair landing poking out, a yard fixture's top — that
 *  would otherwise balloon the box past the real floor. Null when the plane has no slab. */
function planeFootprint(
  blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[], py: number,
): { minX: number; maxX: number; minZ: number; maxZ: number; size: number } | null {
  const cells = new Set<string>();
  for (const b of blocks) {
    if (b.pos[1] !== py || !isStructuralFull(palette, b.state)) continue;
    cells.add(`${b.pos[0]},${b.pos[2]}`);
  }
  if (cells.size === 0) return null;
  const seen = new Set<string>();
  let best: [number, number][] = [];
  for (const c of cells) {
    if (seen.has(c)) continue;
    const comp: [number, number][] = [];
    const st = [c];
    while (st.length) {
      const k = st.pop() as string;
      if (seen.has(k) || !cells.has(k)) continue;
      seen.add(k);
      const [x, z] = k.split(',').map(Number);
      comp.push([x, z]);
      st.push(`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`);
    }
    if (comp.length > best.length) best = comp;
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of best) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ, size: best.length };
}

/** The HOUSE footprint a connector must stay inside — the INTERSECTION of the ABOVE-GRADE
 *  storey planes' largest floor components (the area common to EVERY storey). Two defects
 *  drive this:
 *   - A build with a big SURROUNDINGS yard fills the whole box at grade (the lawn), so the raw
 *     block bounds are the YARD, not the house, and a derived stair happily climbs out onto the
 *     lawn (the "escada no exterior" defect). Above-grade planes are house-only.
 *   - A TAPERING structure (the haunted tower steps inward as it rises) has a WIDER base than
 *     crown. The old UNION footprint let a connector sit near the wide base edge — which at a
 *     higher, stepped-in storey is OUTSIDE the wall (a stair dangling in open air) or buried
 *     INSIDE the thick stepped wall. Both are the user's "never a stair outside / inside the
 *     wall" rule. The INTERSECTION is the column present at every storey, so a connector
 *     clamped to it is interior at EVERY floor — never pokes out, never embeds in a wall.
 *  For a uniform build the intersection equals the union, so nothing changes there. Falls back
 *  to the raw bounds when nothing above grade is usable (a free-form / yard-less build), and to
 *  the union if the intersection has no interior (degenerate, non-concentric storeys). */
export function houseFootprint(
  blocks: AuthoringBlock[], palette: AuthoringPaletteEntry[], planes: number[], grade: number,
  fallback: { minX: number; maxX: number; minZ: number; maxZ: number },
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let uMinX = Infinity, uMaxX = -Infinity, uMinZ = Infinity, uMaxZ = -Infinity; // union (fallback)
  let iMinX = -Infinity, iMaxX = Infinity, iMinZ = -Infinity, iMaxZ = Infinity; // intersection
  let n = 0;
  for (const py of planes) {
    if (py <= grade) continue; // the grade plane carries the yard; above it is house-only
    const fp = planeFootprint(blocks, palette, py);
    if (!fp || fp.size < 9) continue; // ignore a sliver (a partial deck / a stray cluster)
    n++;
    if (fp.minX < uMinX) uMinX = fp.minX; if (fp.maxX > uMaxX) uMaxX = fp.maxX;
    if (fp.minZ < uMinZ) uMinZ = fp.minZ; if (fp.maxZ > uMaxZ) uMaxZ = fp.maxZ;
    if (fp.minX > iMinX) iMinX = fp.minX; if (fp.maxX < iMaxX) iMaxX = fp.maxX;
    if (fp.minZ > iMinZ) iMinZ = fp.minZ; if (fp.maxZ < iMaxZ) iMaxZ = fp.maxZ;
  }
  if (n === 0) return fallback;
  // The intersection must keep a real interior (≥3 cells across so `inHouse`'s strict-interior
  // test leaves a usable column); else the storeys don't share a central core — use the union.
  if (iMaxX - iMinX >= 2 && iMaxZ - iMinZ >= 2) return { minX: iMinX, maxX: iMaxX, minZ: iMinZ, maxZ: iMaxZ };
  return { minX: uMinX, maxX: uMaxX, minZ: uMinZ, maxZ: uMaxZ };
}
