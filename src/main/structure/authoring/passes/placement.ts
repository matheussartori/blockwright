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

    const kind = wallFixtureKind(name);
    if (kind) {
      // A wall fixture leans on the cell opposite its facing — that cell must be a
      // solid (non-glass) block.
      const facing = typeof props.facing === 'string' ? props.facing : undefined;
      const dir = FACINGS.find((d) => d.facing === facing);
      const supported = dir ? isSolidSupport(at(x - dir.dx, y, z - dir.dz)) : false;
      if (supported) { out.push(b); continue; }
      if (kind === 'torch') {
        // Re-anchor: face away from any adjacent solid wall (keeps the light).
        const anchor = FACINGS.find((d) => isSolidSupport(at(x - d.dx, y, z - d.dz)));
        if (anchor) {
          out.push({ ...b, state: intern({ Name: name, Properties: { ...props, facing: anchor.facing } }) });
          reanchoredTorches++;
          continue;
        }
      }
      removedWall++;
      continue;
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

  return { blocks: out, palette: outPalette, fixes };
};
