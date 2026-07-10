import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JigsawConnector } from '@/shared/types';
import type { StructureMeta } from '../../io/load-structure';
import type { ResolvedPool } from '../template-pool';

// The assembler's only IO is loading structure metadata and resolving template
// pools; mock both so the planning logic (attachment, overlap rejection, the
// validation warnings) can be tested deterministically with in-memory fixtures.
const h = vi.hoisted(() => {
  const metaByPath = new Map<string, StructureMeta>();
  const poolById = new Map<string, ResolvedPool>();
  return {
    metaByPath,
    poolById,
    loadStructureMeta: vi.fn(async (p: string) => metaByPath.get(p)),
    resolvePool: vi.fn(
      (id: string): ResolvedPool => poolById.get(id) ?? { id, exists: false, elements: [], fallback: null },
    ),
  };
});

vi.mock('../../io/load-structure', () => ({ loadStructureMeta: h.loadStructureMeta }));
vi.mock('../template-pool', () => ({ resolvePool: h.resolvePool }));

import { assembleJigsaw } from '../jigsaw-assembler';

/** A jigsaw connector facing `front` (top "up") at `pos`, drawing from `pool`. */
function connector(
  pos: [number, number, number],
  front: string,
  name: string,
  target: string,
  pool: string,
): JigsawConnector {
  return {
    pos, name, target, pool, finalState: 'minecraft:air',
    joint: 'aligned', orientation: `${front}_up`, selectionPriority: 0, placementPriority: 0,
  };
}

const meta = (size: [number, number, number], jigsaws: JigsawConnector[]): StructureMeta => ({ size, jigsaws });

const singleElementPool = (id: string, structurePath: string): ResolvedPool => ({
  id, exists: true, fallback: null,
  elements: [{ structureId: 'ns:piece', structurePath, weight: 1, projection: 'rigid' }],
});

beforeEach(() => {
  h.metaByPath.clear();
  h.poolById.clear();
  h.loadStructureMeta.mockClear();
  h.resolvePool.mockClear();
});

describe('assembleJigsaw', () => {
  it('attaches a matching piece from the connector pool', async () => {
    // Root has a south-facing connector drawing from "main"; the piece in that pool
    // carries a north-facing connector named to match the root connector's target.
    h.metaByPath.set('root.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'south', 'root', 't', 'main')]));
    h.metaByPath.set('piece.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'north', 't', 'x', 'minecraft:empty')]));
    h.poolById.set('main', singleElementPool('main', 'piece.nbt'));

    const plan = await assembleJigsaw('root.nbt', 'ns:root', { seed: 1, maxDepth: 1 });
    expect(plan.pieces).toHaveLength(2);
    expect(plan.pieces[0].id).toBe('root');
    expect(plan.warnings).toHaveLength(0);
  });

  it('rejects a second piece that would overlap the first', async () => {
    // Two identical south-facing connectors at the same cell try to attach the same
    // 2×2×2 piece to the same spot — the second placement overlaps and is dropped.
    h.metaByPath.set('root.nbt', meta([2, 2, 2], [
      connector([0, 0, 0], 'south', 'a', 't', 'main'),
      connector([0, 0, 0], 'south', 'b', 't', 'main'),
    ]));
    h.metaByPath.set('piece.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'north', 't', 'x', 'minecraft:empty')]));
    h.poolById.set('main', singleElementPool('main', 'piece.nbt'));

    const plan = await assembleJigsaw('root.nbt', 'ns:root', { seed: 1, maxDepth: 1 });
    expect(plan.pieces).toHaveLength(2); // root + exactly one attached piece
  });

  it('warns when a connector pool does not exist', async () => {
    h.metaByPath.set('root.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'south', 'root', 't', 'gone')]));

    const plan = await assembleJigsaw('root.nbt', 'ns:root', { seed: 1, maxDepth: 2 });
    expect(plan.pieces).toHaveLength(1);
    expect(plan.warnings.some((w) => w.kind === 'empty-pool')).toBe(true);
  });

  it('warns when a pool element references a missing structure', async () => {
    h.metaByPath.set('root.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'south', 'root', 't', 'main')]));
    h.poolById.set('main', {
      id: 'main', exists: true, fallback: null,
      elements: [{ structureId: 'ns:missing', structurePath: null, weight: 1, projection: 'rigid' }],
    });

    const plan = await assembleJigsaw('root.nbt', 'ns:root', { seed: 1, maxDepth: 1 });
    expect(plan.pieces).toHaveLength(1);
    expect(plan.warnings.some((w) => w.kind === 'missing-structure')).toBe(true);
  });

  it('warns with "overlap" when every candidate partially crosses placed bounds', async () => {
    // Same setup as the overlap-rejection test: the second connector's only
    // candidate placement partially crosses the first attached piece. The slot
    // stays empty AND the validator now says why instead of dropping it silently.
    h.metaByPath.set('root.nbt', meta([2, 2, 2], [
      connector([0, 0, 0], 'south', 'a', 't', 'main'),
      connector([0, 0, 0], 'south', 'b', 't', 'main'),
    ]));
    h.metaByPath.set('piece.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'north', 't', 'x', 'minecraft:empty')]));
    h.poolById.set('main', singleElementPool('main', 'piece.nbt'));

    const plan = await assembleJigsaw('root.nbt', 'ns:root', { seed: 1, maxDepth: 1 });
    expect(plan.pieces).toHaveLength(2);
    expect(plan.warnings.some((w) => w.kind === 'overlap')).toBe(true);
  });

  it('warns with "unsupported-orientation" when matches exist but can never face the connector', async () => {
    // The root connector faces UP; the pool's only piece carries the right target
    // name but a HORIZONTAL front — Y-only rotation can never make them oppose.
    h.metaByPath.set('root.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'up', 'root', 't', 'main')]));
    h.metaByPath.set('piece.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'north', 't', 'x', 'minecraft:empty')]));
    h.poolById.set('main', singleElementPool('main', 'piece.nbt'));

    const plan = await assembleJigsaw('root.nbt', 'ns:root', { seed: 1, maxDepth: 1 });
    expect(plan.pieces).toHaveLength(1);
    expect(plan.warnings.some((w) => w.kind === 'unsupported-orientation')).toBe(true);
    // The blunter "no piece has that jigsaw" warning must NOT double-fire.
    expect(plan.warnings.some((w) => w.kind === 'unmatched-target')).toBe(false);
  });

  it('warns with "fallback-expansion" when a fallback pool keeps expanding', async () => {
    h.metaByPath.set('root.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'south', 'root', 't', 'main')]));
    h.metaByPath.set('piece.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'north', 't', 'x', 'minecraft:empty')]));
    // The fallback's piece has its own expandable connector — worldgen would keep
    // growing past the structure def's `size` through it.
    h.metaByPath.set('cap.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'north', 't', 't', 'main')]));
    h.poolById.set('main', { ...singleElementPool('main', 'piece.nbt'), fallback: 'caps' });
    h.poolById.set('caps', singleElementPool('caps', 'cap.nbt'));

    const plan = await assembleJigsaw('root.nbt', 'ns:root', { seed: 1, maxDepth: 1 });
    expect(plan.warnings.some((w) => w.kind === 'fallback-expansion')).toBe(true);
  });

  it('warns when the depth limit leaves connectors unexpanded', async () => {
    // The attached piece carries its own expandable connector, but maxDepth=1 stops
    // the walk before it can be followed.
    h.metaByPath.set('root.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'south', 'root', 't', 'main')]));
    h.metaByPath.set('piece.nbt', meta([2, 2, 2], [connector([0, 0, 0], 'north', 't', 't', 'main')]));
    h.poolById.set('main', singleElementPool('main', 'piece.nbt'));

    const plan = await assembleJigsaw('root.nbt', 'ns:root', { seed: 1, maxDepth: 1 });
    expect(plan.pieces).toHaveLength(2);
    expect(plan.warnings.some((w) => w.kind === 'depth-limit')).toBe(true);
  });
});
