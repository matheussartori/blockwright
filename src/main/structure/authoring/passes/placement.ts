// Enforce block placement rules the way Minecraft would at spawn, so the build
// doesn't ship with "floating" fixtures (a lantern in mid-air, a torch off a wall,
// a torch stuck to a glass window) — the model's #1 physical-validity failure,
// which prose in the knowledge base can't reliably prevent (it ignores the
// warnings, expensively). So every case is now AUTO-FIXED, deterministically:
//   • lanterns      — re-seat onto the surface below / hang from the block above /
//                     remove if nothing supports them;
//   • floor torches — removed unless a solid block is directly beneath;
//   • candles       — removed when floating or stacked on another candle;
//   • carpets/plants/rails/plates — removed when nothing solid is below;
//   • wall fixtures — a wall torch with no valid (solid, non-glass) backing is
//                     re-anchored to an adjacent solid wall, else removed; a wall
//                     sign/banner/ladder with no backing is removed.
// Support is evaluated against the build as authored (a frozen neighbour map), so
// the pass is order-independent. "Solid" support excludes glass/panes/thin blocks
// (see isSolidSupport); lanterns/candles/ground only need *some* block, so they use
// the looser "is any block there" test.
import { posKey } from '../geometry';
import { bareId, isAir, makeIntern } from '../palette';
import type { AuthoringBlock } from '../types';
import {
  FACINGS, isCandle, isFloorTorch, isLantern, isSolidSupport, needsGroundBelow, wallFixtureKind,
} from './placement-rules';
import type { Pass } from './types';

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export const fixPlacement: Pass = (blocks, palette) => {
  // Frozen lookup of the structure as authored, for support tests.
  const nameAt = new Map<string, string>();
  for (const b of blocks) nameAt.set(posKey(...b.pos), palette[b.state]?.Name ?? '');
  const at = (x: number, y: number, z: number): string | undefined => nameAt.get(posKey(x, y, z));
  const hasBlock = (x: number, y: number, z: number): boolean => {
    const n = at(x, y, z);
    return n !== undefined && !isAir(n);
  };
  const solidBelow = (x: number, y: number, z: number): boolean => isSolidSupport(at(x, y - 1, z));

  const outPalette = palette.slice();
  const intern = makeIntern(outPalette);

  let loweredLanterns = 0, raisedLanterns = 0, removedLanterns = 0;
  let removedTorches = 0, removedCandles = 0, removedGround = 0;
  let reanchoredTorches = 0, removedWall = 0;
  let clearedChestTops = 0, openedDoorways = 0, seatedSlabs = 0;
  // Cells to delete after the per-block pass: decoration sitting on a chest lid, and
  // wall blocks plugging a doorway. Collected by position so order doesn't matter.
  const carve = new Set<string>();

  const out: AuthoringBlock[] = [];
  for (const b of blocks) {
    const entry = palette[b.state];
    const name = entry?.Name ?? '';
    const id = bareId(name);
    const props = entry?.Properties ?? {};
    const [x, y, z] = b.pos;
    const below = hasBlock(x, y - 1, z);
    const above = hasBlock(x, y + 1, z);

    if (isLantern(id)) {
      const hanging = String(props.hanging) === 'true';
      if (hanging && !above) {
        if (below) { out.push({ ...b, state: intern({ Name: name, Properties: { ...props, hanging: 'false' } }) }); loweredLanterns++; }
        else removedLanterns++;
        continue;
      }
      if (!hanging && !below) {
        if (above) { out.push({ ...b, state: intern({ Name: name, Properties: { ...props, hanging: 'true' } }) }); raisedLanterns++; }
        else removedLanterns++;
        continue;
      }
      out.push(b);
      continue;
    }

    if (isFloorTorch(id)) {
      if (!solidBelow(x, y, z)) { removedTorches++; continue; }
      out.push(b);
      continue;
    }

    if (isCandle(id)) {
      const belowName = at(x, y - 1, z);
      const onCandle = belowName !== undefined && isCandle(bareId(belowName));
      if (!below || onCandle) { removedCandles++; continue; }
      out.push(b);
      continue;
    }

    if (needsGroundBelow(id)) {
      // Lenient: a carpet/plate/plant just needs *something* under it (it can sit on
      // glass, a slab, a fence-post table, …). Only a truly floating one is removed.
      if (!below) { removedGround++; continue; }
      out.push(b);
      continue;
    }

    // A `type:top` slab sits in the UPPER half of its cell — so a top slab resting on
    // a block below it floats a half-block above that block (the classic "floating
    // slab"). Seat it: flip to `bottom` when there's something to sit on below and
    // open air above. Skip when below is a stair/slab (the roof op's ridge cap sits
    // on stairs and is meant to be top), or when a block above makes it a ceiling lip.
    if (id.endsWith('_slab') && props.type === 'top') {
      const belowName = at(x, y - 1, z);
      const belowId = belowName ? bareId(belowName) : '';
      const seatable = belowName !== undefined && !isAir(belowName) && !belowId.endsWith('_stairs') && !belowId.endsWith('_slab');
      if (seatable && !above) {
        out.push({ ...b, state: intern({ Name: name, Properties: { ...props, type: 'bottom' } }) });
        seatedSlabs++;
        continue;
      }
      out.push(b);
      continue;
    }

    const kind = wallFixtureKind(name);
    if (kind) {
      // A wall fixture must have a SOLID block behind it (opposite its facing) AND
      // face into OPEN space. Facing into a wall (front also solid) means it replaced
      // a structural block, punching a hole — so that is NOT well placed.
      const wellPlaced = (d: { dx: number; dz: number }): boolean =>
        isSolidSupport(at(x - d.dx, y, z - d.dz)) && !isSolidSupport(at(x + d.dx, y, z + d.dz));
      const dir = FACINGS.find((d) => d.facing === props.facing);
      if (dir && wellPlaced(dir)) { out.push(b); continue; }
      if (kind === 'torch') {
        // Re-anchor: face into open space with a solid wall behind (keeps the light).
        const anchor = FACINGS.find((d) => wellPlaced(d));
        if (anchor) {
          out.push({ ...b, state: intern({ Name: name, Properties: { ...props, facing: anchor.facing } }) });
          reanchoredTorches++;
          continue;
        }
      }
      // A LADDER is a vertical climbing column, not an isolated wall fixture: keep a rung
      // that continues a column (another ladder directly above or below it) even when
      // THIS rung's "faces open space" test fails — at a floor line the cell in front of
      // the ladder IS the floor, and where the wall has a joist/window gap the backing
      // lapses. Removing such a rung fragments the shaft, and `fixCirculation` then strips
      // the floating remainder, leaving an unclimbable hole-to-nowhere. Only a genuinely
      // isolated, unbacked ladder falls through to removal (fixCirculation drops a whole
      // floating/too-short run).
      if (id === 'ladder') {
        const ladderAt = (yy: number): boolean => {
          const n = at(x, yy, z);
          return n !== undefined && bareId(n) === 'ladder';
        };
        if (ladderAt(y - 1) || ladderAt(y + 1)) { out.push(b); continue; }
      }
      removedWall++;
      continue;
    }

    // Top-opening container: keep its lid cell clear. Drop a decoration sitting on a
    // chest (a candle/lantern/pot on the lid); leave a solid block above alone (that's
    // a framing question, not ours to gut).
    if (id === 'chest' || id === 'trapped_chest') {
      const aboveName = at(x, y + 1, z);
      if (aboveName !== undefined && !isAir(aboveName) && !isSolidSupport(aboveName)) {
        carve.add(posKey(x, y + 1, z));
        clearedChestTops++;
      }
    }

    // A door must be walkable: the cells in line with its facing (front and back, both
    // door halves) must be passable. If a solid wall plugs one, carve it so the door
    // actually leads somewhere instead of opening into a wall.
    if (id.endsWith('_door') && props.half === 'lower') {
      const dir = FACINGS.find((d) => d.facing === props.facing);
      if (dir) {
        let opened = false;
        for (const s of [1, -1]) {        // front (+facing), back (−facing)
          for (const dy of [0, 1]) {       // both door halves
            const cx = x + s * dir.dx, cy = y + dy, cz = z + s * dir.dz;
            if (isSolidSupport(at(cx, cy, cz))) { carve.add(posKey(cx, cy, cz)); opened = true; }
          }
        }
        if (opened) openedDoorways++;
      }
    }

    out.push(b);
  }

  const fixes: string[] = [];
  if (loweredLanterns) fixes.push(`re-seated ${plural(loweredLanterns, 'floating lantern')} onto the surface below`);
  if (raisedLanterns) fixes.push(`hung ${plural(raisedLanterns, 'floating lantern')} from the block above`);
  if (removedLanterns) fixes.push(`removed ${plural(removedLanterns, 'unsupported lantern')}`);
  if (removedTorches) fixes.push(`removed ${plural(removedTorches, 'floating floor torch')}`);
  if (removedCandles) fixes.push(`removed ${plural(removedCandles, 'floating or stacked candle')}`);
  if (removedGround) fixes.push(`removed ${plural(removedGround, 'unsupported carpet/plant/rail/plate')}`);
  if (reanchoredTorches) fixes.push(`re-anchored ${plural(reanchoredTorches, 'wall torch')} onto a solid wall`);
  if (removedWall) fixes.push(`removed ${plural(removedWall, 'wall fixture')} with no solid backing (e.g. stuck to glass or floating)`);
  if (clearedChestTops) fixes.push(`cleared ${plural(clearedChestTops, 'block')} sitting on a chest lid (kept it openable)`);
  if (openedDoorways) fixes.push(`opened ${plural(openedDoorways, 'doorway')} that was blocked by a wall`);
  if (seatedSlabs) fixes.push(`seated ${plural(seatedSlabs, 'floating top-slab')} onto the block below (flipped to bottom)`);

  const kept = carve.size ? out.filter((b) => !carve.has(posKey(...b.pos))) : out;
  return { blocks: kept, palette: outPalette, fixes };
};
