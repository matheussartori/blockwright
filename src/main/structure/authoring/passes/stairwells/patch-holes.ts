// Rule 4's FLOOR side: after the old climb is stripped, the opening it had cut
// through the floor above survives as a bare interior hole — floor it back.
import { posKey } from '../../geometry';
import { isStructuralFull } from '../flights';
import type { AuthoringBlock, AuthoringPaletteEntry } from '../../types';

/** Refill the floor-plane holes left behind when an old climb is stripped. For each
 *  storey plane, flood the footprint from its border through non-floor cells; any open
 *  cell the flood can't reach is an INTERIOR hole. A hole CLUSTER is kept open only when
 *  the rebuilt connector cut it (any cell is in `reserved` — its precise opening). A
 *  cluster the connector never claimed but that still sits over geometry we stripped is
 *  an orphan remnant → floored with the plane's dominant material. (Deliberate voids — an
 *  atrium the model never built a climb into — were never stripped, so they're left.) */
export function patchOrphanHoles(
  blocks: AuthoringBlock[],
  palette: AuthoringPaletteEntry[],
  planes: number[],
  mats: Map<number, number>,
  reserved: Set<string>,
  stripKeys: Set<string>,
  minX: number, maxX: number, minZ: number, maxZ: number,
): { blocks: AuthoringBlock[]; filled: number } {
  if (stripKeys.size === 0) return { blocks, filled: 0 };
  const finalAt = new Map<string, AuthoringBlock>();
  for (const b of blocks) finalAt.set(posKey(...b.pos), b);
  const solidPlane = (x: number, y: number, z: number): boolean => {
    const b = finalAt.get(posKey(x, y, z));
    return !!b && isStructuralFull(palette, b.state);
  };
  const fill: AuthoringBlock[] = [];
  for (let pi = 0; pi < planes.length; pi++) {
    const py = planes[pi];
    const mat = mats.get(py);
    if (mat === undefined) continue;
    const prev = pi > 0 ? planes[pi - 1] : py - 1; // scan the column down to (not incl.) the plane beneath
    const open = (x: number, z: number): boolean => !solidPlane(x, py, z);
    // Flood from the bounding-box border; unreached open cells are interior holes.
    const seen = new Set<string>();
    const stack: [number, number][] = [];
    for (let x = minX - 1; x <= maxX + 1; x++) { stack.push([x, minZ - 1]); stack.push([x, maxZ + 1]); }
    for (let z = minZ - 1; z <= maxZ + 1; z++) { stack.push([minX - 1, z]); stack.push([maxX + 1, z]); }
    while (stack.length) {
      const [x, z] = stack.pop() as [number, number];
      if (x < minX - 1 || x > maxX + 1 || z < minZ - 1 || z > maxZ + 1) continue;
      const k = `${x},${z}`;
      if (seen.has(k) || !open(x, z)) continue;
      seen.add(k);
      stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
    }
    // Cluster the unreached open cells.
    const hset = new Set<string>();
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      if (open(x, z) && !seen.has(`${x},${z}`)) hset.add(`${x},${z}`);
    }
    const done = new Set<string>();
    for (const cell of hset) {
      if (done.has(cell)) continue;
      const cluster: [number, number][] = [];
      const st: [number, number][] = [cell.split(',').map(Number) as [number, number]];
      while (st.length) {
        const [x, z] = st.pop() as [number, number];
        const k = `${x},${z}`;
        if (done.has(k) || !hset.has(k)) continue;
        done.add(k);
        cluster.push([x, z]);
        st.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
      }
      // Classify EACH cell of the cluster: is its column an orphan remnant (the old
      // climb was stripped beneath it) and does the rebuilt connector claim its plane
      // cell? A connector's own opening (`reserved`) stays open; every OTHER cell that
      // sits over stripped geometry is floored back. This is what keeps the stairwell
      // opening matched to the CONNECTOR's width: when a 1-wide stair replaces a wider
      // old climb, the extra floor cells beside it (over the stripped old treads) get
      // floored instead of surviving as a fall-through gap next to the stairs.
      let hasConnector = false, anyOverStrip = false;
      const cells: { x: number; z: number; over: boolean }[] = [];
      for (const [x, z] of cluster) {
        if (reserved.has(posKey(x, py, z))) hasConnector = true;
        let over = false;
        for (let y = py; y > prev; y--) if (stripKeys.has(posKey(x, y, z))) { over = true; break; }
        if (over) anyOverStrip = true;
        cells.push({ x, z, over });
      }
      // No connector AND nothing stripped beneath it → a deliberate void (an atrium the
      // model never built a climb into): leave it open.
      if (!hasConnector && !anyOverStrip) continue;
      for (const { x, z, over } of cells) {
        if (reserved.has(posKey(x, py, z))) continue; // the active connector opening stays open
        if (over) fill.push({ state: mat, pos: [x, py, z] }); // orphan remnant beside/within the climb
      }
    }
  }
  return fill.length ? { blocks: blocks.concat(fill), filled: fill.length } : { blocks, filled: 0 };
}
