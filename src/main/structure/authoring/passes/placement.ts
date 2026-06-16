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
import { connFamily } from './connect-blocks';
import { computeEnvelope } from './envelope';
import {
  FACINGS, isCandle, isFloorHead, isFloorTorch, isLantern, isSolidSupport, needsGroundBelow, wallFixtureKind,
} from './placement-rules';
import type { Pass } from './types';

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

const isDoorName = (name: string): boolean => bareId(name).endsWith('_door');

// 6-neighbour offsets, for the floating-connector component flood.
const N6: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/** Cells holding a pane/bar/fence/wall whose whole connected group has NO solid
 *  anchor anywhere (no full block below or beside any member) — a railing/grille
 *  floating in mid-air, e.g. a line of iron bars hovering above the roof. Found by
 *  flooding each connecting group and removing the group only when nothing solid
 *  touches it (a window pane set in a wall, or a railing resting on one, is anchored
 *  and kept). */
function floatingConnectors(
  blocks: AuthoringBlock[], nameAt: (x: number, y: number, z: number) => string | undefined,
): Set<string> {
  const memberKeys = new Set<string>();
  for (const b of blocks) {
    const n = nameAt(b.pos[0], b.pos[1], b.pos[2]);
    if (n !== undefined && connFamily(n)) memberKeys.add(posKey(...b.pos));
  }
  const floating = new Set<string>();
  const seen = new Set<string>();
  const parse = (k: string): [number, number, number] => k.split(',').map(Number) as [number, number, number];
  for (const start of memberKeys) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const stack = [start];
    seen.add(start);
    let anchored = false;
    while (stack.length) {
      const k = stack.pop() as string;
      group.push(k);
      const [x, y, z] = parse(k);
      for (const [dx, dy, dz] of N6) {
        const nk = posKey(x + dx, y + dy, z + dz);
        if (memberKeys.has(nk)) {
          if (!seen.has(nk)) { seen.add(nk); stack.push(nk); }
        } else if (isSolidSupport(nameAt(x + dx, y + dy, z + dz))) {
          anchored = true; // a real solid block touches the group → it's supported
        }
      }
    }
    if (!anchored) for (const k of group) floating.add(k);
  }
  return floating;
}

export const fixPlacement: Pass = (blocks, palette, ctx) => {
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
  let removedTorches = 0, removedCandles = 0, removedGround = 0, removedHeads = 0;
  let reanchoredTorches = 0, removedWall = 0;
  let clearedChestTops = 0, openedDoorways = 0, seatedSlabs = 0;
  let removedOrphanDoors = 0, removedFloating = 0;

  // Pre-compute the floating connecting blocks (railings/grilles with no solid
  // anchor) once, against the frozen geometry — a global, order-independent test.
  const floating = floatingConnectors(blocks, at);
  // Cells to delete after the per-block pass: decoration sitting on a chest lid, and
  // wall blocks plugging a doorway. Collected by position so order doesn't matter.
  const carve = new Set<string>();
  // The exterior envelope + the locked shell cells, for the doorway carve: an interior
  // blocker is always carvable, but a block on the watertight outer SKIN may only be
  // opened where the passage completes to the outside (finishing an entrance) — never
  // a code-owned locked shell block, and never a carve that leaves a blind niche in a
  // double-thick wall or breaches a sealed interior through the facade.
  const env = computeEnvelope(blocks, palette);
  const locked = new Set(
    (ctx?.lockCells ?? []).filter((c) => !isAir(c.entry.Name)).map((c) => posKey(c.pos[0], c.pos[1], c.pos[2])),
  );

  const out: AuthoringBlock[] = [];
  for (const b of blocks) {
    const entry = palette[b.state];
    const name = entry?.Name ?? '';
    const id = bareId(name);
    const props = entry?.Properties ?? {};
    const [x, y, z] = b.pos;
    const below = hasBlock(x, y - 1, z);
    const above = hasBlock(x, y + 1, z);

    // A pane/bar/fence/wall whose whole group floats with no solid anchor — drop it
    // (the "iron bars hovering over the roof" defect).
    if (floating.has(posKey(x, y, z))) { removedFloating++; continue; }

    // A door is ALWAYS two halves. A lone half — an UPPER with no lower beneath, or a
    // LOWER with no upper above — is debris: either a "door floating in mid-air" or the
    // single-leaf "half door" the model drops as decoration (a row of lower-only doors
    // standing in a room). Neither is a real, usable door, and doors as decoration just
    // read as broken, so drop any unpaired half (the model can re-place a complete door
    // where an entrance actually belongs).
    if (isDoorName(name)) {
      const mate = props.half === 'upper' ? at(x, y - 1, z) : at(x, y + 1, z);
      if (mate === undefined || !isDoorName(mate)) { removedOrphanDoors++; continue; }
    }

    if (isLantern(id)) {
      const hanging = String(props.hanging) === 'true';
      // A HANGING lantern attaches to the bottom face of the block above — a solid block
      // or a chain. It CANNOT hang from another lantern (the lower one pops off when the
      // structure spawns — the "stacked lanterns" defect). A FLOOR lantern rests on the
      // block below, which likewise can't be another lantern.
      const aboveName = at(x, y + 1, z), belowName = at(x, y - 1, z);
      const hangSupport = isSolidSupport(aboveName) || (aboveName !== undefined && bareId(aboveName) === 'chain');
      const restSupport = below && !(belowName !== undefined && isLantern(bareId(belowName)));
      if (hanging) {
        if (hangSupport) { out.push(b); continue; }                 // valid hang
        if (restSupport) { out.push({ ...b, state: intern({ Name: name, Properties: { ...props, hanging: 'false' } }) }); loweredLanterns++; continue; }
        removedLanterns++; continue;                                // hanging from nothing / from a lantern
      }
      if (restSupport) { out.push(b); continue; }                   // valid floor lantern
      if (hangSupport) { out.push({ ...b, state: intern({ Name: name, Properties: { ...props, hanging: 'true' } }) }); raisedLanterns++; continue; }
      removedLanterns++; continue;
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

    // A floor skull/head needs a solid block directly beneath it (the cult-temple
    // basement likes to float them). Remove a floating one — it pops off on spawn.
    if (isFloorHead(id)) {
      if (!solidBelow(x, y, z)) { removedHeads++; continue; }
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
    // actually leads somewhere instead of opening into a wall. A LOCKED shell cell is
    // never carved; a blocker on the exterior SKIN is carved only when the cell beyond
    // it is open outside (the carve completes an entrance) — carving any other shell
    // cell would leave a blind niche in a double-thick wall, or punch the facade
    // through into a sealed interior.
    if (id.endsWith('_door') && props.half === 'lower') {
      const dir = FACINGS.find((d) => d.facing === props.facing);
      if (dir) {
        let opened = false;
        // Front (+facing) only needs the single approach cell cleared; the INTERIOR side
        // (−facing) is cleared TWO cells deep so a wall/furniture the AI placed directly
        // behind the door can't dead-end the entrance (the "porta bloqueada por blocos"
        // defect — you need actual space to step inside).
        for (const s of [1, -1]) {        // front (+facing), back (−facing)
          const depth = s === -1 ? 2 : 1;
          for (let d = 1; d <= depth; d++) {
            for (const dy of [0, 1]) {     // both door halves
              const cx = x + s * d * dir.dx, cy = y + dy, cz = z + s * d * dir.dz;
              if (!isSolidSupport(at(cx, cy, cz))) continue;
              if (locked.has(posKey(cx, cy, cz))) continue;
              if (env.isShell(cx, cy, cz) && !env.isOutside(x + (d + 1) * s * dir.dx, cy, z + (d + 1) * s * dir.dz)) continue;
              carve.add(posKey(cx, cy, cz));
              opened = true;
            }
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
  if (removedHeads) fixes.push(`removed ${plural(removedHeads, 'floating skull/head')} with nothing beneath it`);
  if (removedGround) fixes.push(`removed ${plural(removedGround, 'unsupported carpet/plant/rail/plate')}`);
  if (reanchoredTorches) fixes.push(`re-anchored ${plural(reanchoredTorches, 'wall torch')} onto a solid wall`);
  if (removedWall) fixes.push(`removed ${plural(removedWall, 'wall fixture')} with no solid backing (e.g. stuck to glass or floating)`);
  if (clearedChestTops) fixes.push(`cleared ${plural(clearedChestTops, 'block')} sitting on a chest lid (kept it openable)`);
  if (openedDoorways) fixes.push(`opened ${plural(openedDoorways, 'doorway')} that was blocked by a wall`);
  if (seatedSlabs) fixes.push(`seated ${plural(seatedSlabs, 'floating top-slab')} onto the block below (flipped to bottom)`);
  if (removedOrphanDoors) fixes.push(`removed ${plural(removedOrphanDoors, 'orphan door half')} with no matching half (a door floating in mid-air, or a single-leaf "half door" used as decoration)`);
  if (removedFloating) fixes.push(`removed ${plural(removedFloating, 'floating pane/bar/fence/wall')} with no solid support (e.g. a railing hovering over the roof)`);

  const kept = carve.size ? out.filter((b) => !carve.has(posKey(...b.pos))) : out;
  return { blocks: kept, palette: outPalette, fixes };
};
