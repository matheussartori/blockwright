// Plans a jigsaw assembly: starting from a root structure, it follows each
// connector into its template pool, attaches a piece, and recurses — the same
// shape as worldgen, but deterministic (seeded) and bounded. The geometry is
// pure (shared/jigsaw); this layer adds the IO (loading pools + structure
// metadata), the random-but-reproducible choices, overlap rejection, and the
// validation warnings surfaced to the user.
//
// All coordinates/rotations come from shared/jigsaw so the renderer places the
// meshes at exactly the positions computed here.
import type {
  AssembleOptions,
  JigsawCandidate,
  JigsawConnector,
  JigsawPlan,
  JigsawWarning,
  PlacedPiece,
} from '@/shared/types';
import {
  type Aabb,
  type Placement,
  aabbOverlap,
  makeRng,
  pickIndex,
  pickWeighted,
  pieceAabb,
  rootPlacement,
  solveAttachment,
} from '@/shared/jigsaw';
import { loadStructureMeta, type StructureMeta } from '../io/load-structure';
import { resolvePool, type ResolvedPool, type ResolvedPoolElement } from './template-pool';

const EMPTY_POOL = 'minecraft:empty';
/** Hard cap so a self-recursive pool can't plan forever. */
const MAX_PIECES = 200;

/** A connector worth following: it draws from a real (non-empty) pool. */
function isExpandable(c: JigsawConnector): boolean {
  return c.pool !== '' && c.pool !== EMPTY_POOL;
}

interface PlacedNode {
  piece: PlacedPiece;
  meta: StructureMeta;
  placement: Placement;
  box: Aabb;
}

/**
 * One assembly run. Instantiated per request so its metadata cache and warning
 * set are scoped to that run; the public entry points are the module functions
 * below.
 */
class Assembler {
  private readonly metaCache = new Map<string, StructureMeta>();
  private readonly warnings: JigsawWarning[] = [];
  private readonly seen = new Set<string>();

  private async meta(path: string): Promise<StructureMeta> {
    let m = this.metaCache.get(path);
    if (!m) {
      m = await loadStructureMeta(path);
      this.metaCache.set(path, m);
    }
    return m;
  }

  /** Record a warning once per kind+message (assembly retries would repeat them). */
  private warn(kind: JigsawWarning['kind'], message: string, pieceId?: string): void {
    const key = `${kind}|${message}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.warnings.push({ kind, message, pieceId });
  }

  // --- Full assembly ---------------------------------------------------------

  async assemble(rootPath: string, rootId: string, options: AssembleOptions): Promise<JigsawPlan> {
    const rng = makeRng(options.seed);
    const rootMeta = await this.meta(rootPath);
    await this.validate(rootMeta, rootId);

    const rootPl = rootPlacement();
    const root: PlacedNode = {
      piece: { id: 'root', structureId: rootId, structurePath: rootPath, offset: [0, 0, 0], quarterTurns: 0, depth: 0 },
      meta: rootMeta,
      placement: rootPl,
      box: pieceAabb(rootMeta.size, rootPl),
    };
    const placed: PlacedNode[] = [root];

    // Breadth-first by depth; connectors with higher selection priority first.
    let frontier: PlacedNode[] = [root];
    let depthHit = false;
    for (let depth = 0; depth < options.maxDepth && frontier.length > 0; depth++) {
      const next: PlacedNode[] = [];
      for (const node of frontier) {
        const connectors = [...node.meta.jigsaws]
          .filter(isExpandable)
          .sort((a, b) => b.selectionPriority - a.selectionPriority);
        for (const connector of connectors) {
          if (placed.length >= MAX_PIECES) break;
          const child = await this.tryAttach(connector, node, rng, placed, placed.length, depth + 1);
          if (child) {
            placed.push(child);
            next.push(child);
          }
        }
      }
      if (depth + 1 >= options.maxDepth && next.some((n) => n.meta.jigsaws.some(isExpandable))) {
        depthHit = true;
      }
      frontier = next;
    }
    if (depthHit) this.warn('depth-limit', `Stopped at depth ${options.maxDepth}; some connectors were left unexpanded.`);

    return { pieces: placed.map((n) => n.piece), warnings: this.warnings };
  }

  /** Attach a child to `connector`. Tries the connector's pool first; if the dice
   *  land on an `empty` element the slot is left bare (as in worldgen), and if no
   *  piece fits, the pool's `fallback` (usually terminators) gets a turn. Returns
   *  null when the slot ends up empty. */
  private async tryAttach(
    connector: JigsawConnector,
    parent: PlacedNode,
    rng: () => number,
    placed: PlacedNode[],
    nextIndex: number,
    depth: number,
  ): Promise<PlacedNode | null> {
    const pool = resolvePool(connector.pool);
    const result = await this.attachFromPool(pool, connector, parent, rng, placed, nextIndex, depth);
    if (result === 'empty') return null; // terminated cleanly — no fallback
    if (result !== 'none') return result; // a piece fit
    // Nothing fit; cap the slot with the fallback pool (terminators).
    if (pool.fallback && pool.fallback !== EMPTY_POOL) {
      const fb = await this.attachFromPool(resolvePool(pool.fallback), connector, parent, rng, placed, nextIndex, depth);
      if (fb !== 'empty' && fb !== 'none') return fb;
    }
    return null;
  }

  /** Try to place one piece from `pool` onto `connector`, in weighted-random
   *  order. Returns the placed node, or 'empty' when the pick was a terminal
   *  element (leave the slot bare), or 'none' when nothing fit. */
  private async attachFromPool(
    pool: ResolvedPool,
    connector: JigsawConnector,
    parent: PlacedNode,
    rng: () => number,
    placed: PlacedNode[],
    nextIndex: number,
    depth: number,
  ): Promise<PlacedNode | 'empty' | 'none'> {
    for (const el of weightedOrder(pool.elements, rng)) {
      if (el.empty) return 'empty';
      if (!el.structurePath) {
        this.warn('missing-structure', `Template ${el.structureId} (pool ${pool.id}) was not found.`);
        continue;
      }
      const childMeta = await this.meta(el.structurePath);
      const matches = childMeta.jigsaws.filter((j) => j.name === connector.target);
      for (const childConn of shuffle(matches, rng)) {
        const placement = solveAttachment(connector, parent.placement, childConn, (turns) =>
          turns[pickIndex(rng(), turns.length)],
        );
        if (!placement) continue;
        const box = pieceAabb(childMeta.size, placement);
        // Reject overlaps with other pieces, but not with the parent: a child
        // intentionally interpenetrates the piece it attaches to (a house's
        // entrance reaches into the street, on-surface decor sits in the plaza).
        if (placed.some((n) => n !== parent && aabbOverlap(n.box, box))) continue;
        return {
          piece: {
            id: `p${nextIndex}`,
            structureId: el.structureId,
            structurePath: el.structurePath,
            offset: placement.offset,
            quarterTurns: placement.quarterTurns,
            depth,
          },
          meta: childMeta,
          placement,
          box,
        };
      }
    }
    return 'none';
  }

  // --- Manual mode: candidates for a single connector ------------------------

  async candidates(rootPath: string, connectorIndex: number): Promise<JigsawCandidate[]> {
    const rootMeta = await this.meta(rootPath);
    const connector = rootMeta.jigsaws[connectorIndex];
    if (!connector) return [];
    const pool = resolvePool(connector.pool);
    const source = rootPlacement();
    const out: JigsawCandidate[] = [];
    for (const el of pool.elements) {
      if (!el.structurePath) continue;
      const childMeta = await this.meta(el.structurePath);
      const childConn = childMeta.jigsaws.find((j) => j.name === connector.target);
      if (!childConn) continue;
      const placement = solveAttachment(connector, source, childConn);
      if (!placement) continue;
      out.push({
        structureId: el.structureId,
        structurePath: el.structurePath,
        weight: el.weight,
        placement: {
          id: 'manual',
          structureId: el.structureId,
          structurePath: el.structurePath,
          offset: placement.offset,
          quarterTurns: placement.quarterTurns,
          depth: 1,
        },
      });
    }
    return out;
  }

  // --- Validation (step 5) ---------------------------------------------------

  /** Static checks on a structure's connectors: missing/empty pools, broken
   *  template references, and "dead" connectors whose target matches nothing. */
  private async validate(meta: StructureMeta, structureId: string): Promise<void> {
    for (const c of meta.jigsaws.filter(isExpandable)) {
      const pool = resolvePool(c.pool);
      if (!pool.exists) {
        this.warn('empty-pool', `Pool ${c.pool} (from a connector in ${structureId}) was not found.`);
        continue;
      }
      if (pool.elements.length === 0) {
        this.warn('empty-pool', `Pool ${c.pool} has no placeable elements.`);
        continue;
      }
      // An `empty` element is a valid terminal outcome, so a pool with one can
      // always "satisfy" the connector even if no piece carries the target name.
      let targetMatched = pool.elements.some((el) => el.empty);
      for (const el of pool.elements) {
        if (el.empty) continue;
        if (!el.structurePath) {
          this.warn('missing-structure', `Template ${el.structureId} (pool ${c.pool}) was not found.`);
          continue;
        }
        const childMeta = await this.meta(el.structurePath);
        if (childMeta.jigsaws.some((j) => j.name === c.target)) targetMatched = true;
      }
      if (!targetMatched) {
        this.warn('unmatched-target', `No piece in pool ${c.pool} has a jigsaw named "${c.target}".`);
      }
    }
  }
}

/** Iterate pool elements in weighted-random order (without replacement). */
function weightedOrder(elements: ResolvedPoolElement[], rng: () => number): ResolvedPoolElement[] {
  const pool = [...elements];
  const order: ResolvedPoolElement[] = [];
  while (pool.length > 0) {
    const i = pickWeighted(rng(), pool.map((e) => e.weight));
    order.push(pool.splice(i, 1)[0]);
  }
  return order;
}

/** Fisher–Yates shuffle driven by the seeded RNG (kept reproducible). */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Plan a full (seeded, bounded) jigsaw assembly starting from `rootPath`, returning
 *  the placed pieces + any validation warnings. */
export function assembleJigsaw(rootPath: string, rootId: string, options: AssembleOptions): Promise<JigsawPlan> {
  return new Assembler().assemble(rootPath, rootId, options);
}

/** The candidate pieces that could attach to one connector of `rootPath` (manual mode). */
export function jigsawCandidates(rootPath: string, connectorIndex: number): Promise<JigsawCandidate[]> {
  return new Assembler().candidates(rootPath, connectorIndex);
}
