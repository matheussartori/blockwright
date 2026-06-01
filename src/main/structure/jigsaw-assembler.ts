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
  type Placement,
  aabbOverlap,
  makeRng,
  pickIndex,
  pickWeighted,
  pieceAabb,
  rootPlacement,
  solveAttachment,
} from '@/shared/jigsaw';
import { loadStructureMeta, type StructureMeta } from './load-structure';
import { resolvePool, type ResolvedPoolElement } from './template-pool';

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

    const root: PlacedNode = {
      piece: { id: 'root', structureId: rootId, structurePath: rootPath, offset: [0, 0, 0], quarterTurns: 0, depth: 0 },
      meta: rootMeta,
      placement: rootPlacement(),
    };
    const placed: PlacedNode[] = [root];
    const aabbs = [pieceAabb(rootMeta.size, root.placement)];

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
          const child = await this.tryAttach(connector, node, rng, aabbs, placed.length, depth + 1);
          if (child) {
            placed.push(child);
            aabbs.push(pieceAabb(child.meta.size, child.placement));
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

  /** Attach a child to `connector`, trying pool elements in weighted-random order
   *  until one fits without overlapping. Returns null when none can attach. */
  private async tryAttach(
    connector: JigsawConnector,
    parent: PlacedNode,
    rng: () => number,
    aabbs: ReturnType<typeof pieceAabb>[],
    nextIndex: number,
    depth: number,
  ): Promise<PlacedNode | null> {
    const pool = resolvePool(connector.pool);
    for (const el of weightedOrder(pool.elements, rng)) {
      if (!el.structurePath) {
        this.warn('missing-structure', `Template ${el.structureId} (pool ${connector.pool}) was not found.`);
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
        if (aabbs.some((a) => aabbOverlap(a, box))) continue;
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
        };
      }
    }
    return null;
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
      let targetMatched = false;
      for (const el of pool.elements) {
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

export function assembleJigsaw(rootPath: string, rootId: string, options: AssembleOptions): Promise<JigsawPlan> {
  return new Assembler().assemble(rootPath, rootId, options);
}

export function jigsawCandidates(rootPath: string, connectorIndex: number): Promise<JigsawCandidate[]> {
  return new Assembler().candidates(rootPath, connectorIndex);
}
