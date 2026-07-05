// Cut an oversized structure into a JIGSAW assembly that reassembles voxel-perfectly in
// Minecraft. Each tree edge (shared/domain/split) drops ONE jigsaw connector in the parent
// piece and one in the child; vanilla replaces each jigsaw with its own `final_state`, so we
// set each to the ORIGINAL block at that cell and the only cost is the (at most) two cells
// per edge — placed away from block entities so no NBT is lost. The geometry round-trips
// through `solveAttachment`, so the in-app assembler (and worldgen) reproduce the placement.
//
// In-memory only (no fs) — it returns the files to write; the export layer persists them.
import {
  childSeamCell,
  edgeOrientation,
  edgePoolLeaf,
  faceAxes,
  inConnectorName,
  MAX_JIGSAW_ADAPTED_DISTANCE,
  MAX_JIGSAW_DEPTH,
  outConnectorName,
  parentSeamCell,
  pieceName,
  type SplitEdge,
  type SplitPlan,
  type SplitSlot,
  type Vec3,
} from '@/shared/domain/split';
import { splitFileSpecs, type FileKind, type ValidationIssue, type WorldgenOptions } from '@/shared/domain/worldgen';
import { type Direction, type Placement, solveAttachment } from '@/shared/jigsaw';
import type { JigsawConnector } from '@/shared/types';
import { AIR, blockStateString, type RawBlockEntity, type RawStructure } from './raw';
import type { AuthoringBlock, AuthoringEntity, AuthoringPaletteEntry } from '../authoring/types';
import { encodeStructure, type EncodeInput } from '../authoring/nbt-encode';
import { biomeTagJson, singleElementPoolJson, structureJson, structureSetJson } from '../../export/worldgen-json';

const JIGSAW_BLOCK = 'minecraft:jigsaw';
/** Far pieces are culled beyond this. The vanilla JigsawStructure codec rejects the def when
 *  `max_distance_from_center` + a terrain-adaptation margin exceeds 128 (the margin is 12 for
 *  any adaptation other than `none`), so we cap at 116 — the largest value that always loads. */
const SPLIT_MAX_DISTANCE = MAX_JIGSAW_ADAPTED_DISTANCE;

const posKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** One file the split produces: a piece `.nbt` (buffer) or a worldgen JSON (object). */
export type SplitFile = { rel: string; kind: FileKind } & ({ buffer: Buffer } | { json: unknown });

export interface SplitResult {
  files: SplitFile[];
  warnings: ValidationIssue[];
}

export interface SplitToJigsawOptions {
  namespace: string;
  /** The resource base name (the pieces live under `<base>/`). */
  base: string;
  version: string | null | undefined;
  worldgen: WorldgenOptions;
  dataVersion: number;
}

/** The chosen connector cell for one edge, in each piece's local coords. */
interface Seam {
  parentLocal: Vec3;
  childLocal: Vec3;
}

/** The connectors a piece carries (resolved from the seam choices), in local coords. */
interface ConnectorCell {
  pos: Vec3;
  orientation: string;
  nbt: Record<string, unknown>;
}

/**
 * Builds the full file set (piece `.nbt`s + pools + structure/set/biome) for a split export.
 * Instantiated per run so its derived lookups (block/BE maps, the per-edge seam choices) are
 * scoped to that run — mirrors the `Assembler` class in jigsaw-assembler.ts. The seam choices
 * are made once up front (in the constructor) so the parent's outbound and the child's inbound
 * connector for an edge land on the same physical cell.
 */
class JigsawSplitter {
  /** original cell → palette index. */
  private readonly blockMap = new Map<string, number>();
  /** original cell → block entity (kept off connector cells so no NBT is lost). */
  private readonly beMap = new Map<string, RawBlockEntity>();
  /** slot index → reserved LOCAL connector cells (so two connectors can't collide). */
  private readonly usedCells = new Map<number, Set<string>>();
  /** edge id → the chosen seam cell. */
  private readonly seams = new Map<string, Seam>();
  private readonly warnings: ValidationIssue[] = [];

  constructor(
    private readonly raw: RawStructure,
    private readonly plan: SplitPlan,
    private readonly opts: SplitToJigsawOptions,
  ) {
    for (const b of raw.blocks) this.blockMap.set(posKey(b.pos[0], b.pos[1], b.pos[2]), b.state);
    for (const be of raw.blockEntities ?? []) this.beMap.set(posKey(be.pos[0], be.pos[1], be.pos[2]), be);
    for (const edge of plan.edges) {
      const P = plan.slots[edge.parent];
      const C = plan.slots[edge.child];
      const seam = this.chooseSeam(P, C, edge.dir);
      this.seams.set(edge.edgeId, seam);
      this.reserve(P.index, seam.parentLocal);
      this.reserve(C.index, seam.childLocal);
      this.assertEdgeGeometry(edge, P, C, seam);
    }
  }

  build(): SplitResult {
    const { namespace, base, version, worldgen } = this.opts;
    const pieceLocation = (slot: SplitSlot): string => `${namespace}:${base}/${pieceName(slot)}`;
    const edgeById = new Map(this.plan.edges.map((e) => [e.edgeId, e]));
    const childOfEdge = (edgeId: string): SplitSlot => this.plan.slots[edgeById.get(edgeId)!.child];

    const pieceBuffers = new Map<number, Buffer>(
      this.plan.slots.map((slot) => [slot.index, encodeStructure(this.buildPiece(slot))]),
    );
    const size = Math.min(MAX_JIGSAW_DEPTH, this.plan.depth + 1);

    const files: SplitFile[] = splitFileSpecs(namespace, base, version, this.plan).map((spec) => {
      switch (spec.ref.type) {
        case 'piece':
          return { rel: spec.rel, kind: spec.kind, buffer: pieceBuffers.get(spec.ref.slot)! };
        case 'start_pool':
          return { rel: spec.rel, kind: spec.kind, json: singleElementPoolJson(`${namespace}:${base}/start`, pieceLocation(this.plan.slots[this.plan.root])) };
        case 'edge_pool':
          return { rel: spec.rel, kind: spec.kind, json: singleElementPoolJson(`${namespace}:${base}/${edgePoolLeaf(spec.ref.edgeId)}`, pieceLocation(childOfEdge(spec.ref.edgeId))) };
        case 'structure':
          return { rel: spec.rel, kind: spec.kind, json: structureJson(namespace, base, worldgen, { size, maxDistance: SPLIT_MAX_DISTANCE }) };
        case 'structure_set':
          return { rel: spec.rel, kind: spec.kind, json: structureSetJson(namespace, base, worldgen) };
        case 'biome_tag':
          return { rel: spec.rel, kind: spec.kind, json: biomeTagJson(worldgen) };
      }
    });

    return { files, warnings: this.warnings };
  }

  /** The original block-state string at a cell (air when omitted) — a connector's final_state. */
  private origBlockString(x: number, y: number, z: number): string {
    const s = this.blockMap.get(posKey(x, y, z));
    return s === undefined ? AIR : blockStateString(this.raw.palette[s]);
  }

  private reserve(slot: number, local: Vec3): void {
    let set = this.usedCells.get(slot);
    if (!set) this.usedCells.set(slot, (set = new Set()));
    set.add(posKey(local[0], local[1], local[2]));
  }

  private isFree(slot: number, local: Vec3): boolean {
    return !this.usedCells.get(slot)?.has(posKey(local[0], local[1], local[2]));
  }

  /** Pick a seam cell on the shared face of P→C: prefer the face CENTER among "clean" cells
   *  (no block entity in either piece), falling back to the least-bad cell with a warning. */
  private chooseSeam(P: SplitSlot, C: SplitSlot, dir: Direction): Seam {
    const [ax0, ax1] = faceAxes(dir);
    const ext0 = P.size[ax0];
    const ext1 = P.size[ax1];
    const c0 = (ext0 - 1) / 2;
    const c1 = (ext1 - 1) / 2;

    const candidates: { a: number; b: number; d: number }[] = [];
    for (let a = 0; a < ext0; a++) {
      for (let b = 0; b < ext1; b++) candidates.push({ a, b, d: Math.abs(a - c0) + Math.abs(b - c1) });
    }
    candidates.sort((p, q) => p.d - q.d);

    let fallback: Seam | null = null;
    for (const { a, b } of candidates) {
      const parentLocal = parentSeamCell(dir, P.size, a, b);
      const childLocal = childSeamCell(dir, C.size, a, b);
      if (!this.isFree(P.index, parentLocal) || !this.isFree(C.index, childLocal)) continue; // already a connector
      const pBE = this.beMap.has(posKey(P.min[0] + parentLocal[0], P.min[1] + parentLocal[1], P.min[2] + parentLocal[2]));
      const cBE = this.beMap.has(posKey(C.min[0] + childLocal[0], C.min[1] + childLocal[1], C.min[2] + childLocal[2]));
      if (!pBE && !cBE) return { parentLocal, childLocal }; // clean — best case (center-first)
      fallback ??= { parentLocal, childLocal };
    }
    // A block entity is unavoidable on this seam (or, pathologically, every face cell is taken).
    this.warnings.push({ level: 'warning', code: 'split_block_entity', detail: `${P.min.join(',')}↔${C.min.join(',')}` });
    return fallback ?? { parentLocal: parentSeamCell(dir, P.size, 0, 0), childLocal: childSeamCell(dir, C.size, 0, 0) };
  }

  /** Slice one slot (rebased to local coords), re-attach its block entities, inject the jigsaw
   *  connectors, and intern a per-piece palette → an `encodeStructure` input. */
  private buildPiece(slot: SplitSlot): EncodeInput {
    const [mx, my, mz] = slot.min;
    const [sx, sy, sz] = slot.size;

    const connectors = this.connectorsFor(slot);
    const connectorAt = new Map(connectors.map((c) => [posKey(c.pos[0], c.pos[1], c.pos[2]), c]));

    const palette: AuthoringPaletteEntry[] = [];
    const paletteIndex = new Map<string, number>();
    const intern = (entry: AuthoringPaletteEntry): number => {
      const k = blockStateString(entry as { Name: string; Properties?: Record<string, string | number> });
      let idx = paletteIndex.get(k);
      if (idx === undefined) {
        idx = palette.length;
        palette.push(entry);
        paletteIndex.set(k, idx);
      }
      return idx;
    };

    const blocks: AuthoringBlock[] = [];
    for (const b of this.raw.blocks) {
      const [x, y, z] = b.pos;
      if (x < mx || x >= mx + sx || y < my || y >= my + sy || z < mz || z >= mz + sz) continue;
      const local: Vec3 = [x - mx, y - my, z - mz];
      if (connectorAt.has(posKey(local[0], local[1], local[2]))) continue; // a connector overrides it
      const state = intern(this.raw.palette[b.state]);
      const be = this.beMap.get(posKey(x, y, z));
      blocks.push(be ? { state, pos: local, nbt: { id: be.id, ...be.nbt } } : { state, pos: local });
    }

    // Inject the connectors (they may sit on a cell that was air/omitted in the source).
    // `connectorAt` is keyed by pos, so a degenerate duplicate cell collapses to one block.
    for (const c of connectorAt.values()) {
      const state = intern({ Name: JIGSAW_BLOCK, Properties: { orientation: c.orientation } });
      blocks.push({ state, pos: c.pos, nbt: c.nbt });
    }

    // Carry the structure's entities (armor stands, item frames, mobs) into the piece that
    // contains each one, rebased to local coords — else crossing the split threshold drops them.
    const entities: AuthoringEntity[] = [];
    for (const e of this.raw.entities ?? []) {
      const [bx, by, bz] = e.blockPos;
      if (bx < mx || bx >= mx + sx || by < my || by >= my + sy || bz < mz || bz >= mz + sz) continue;
      entities.push({
        pos: [e.pos[0] - mx, e.pos[1] - my, e.pos[2] - mz],
        blockPos: [bx - mx, by - my, bz - mz],
        ...(e.nbt && Object.keys(e.nbt).length > 0 ? { nbt: e.nbt } : {}),
      });
    }

    return { dataVersion: this.opts.dataVersion, size: slot.size, palette, blocks, entities };
  }

  /** This slot's connectors: an outbound connector per child edge + one inbound per parent edge. */
  private connectorsFor(slot: SplitSlot): ConnectorCell[] {
    const [mx, my, mz] = slot.min;
    const { namespace, base } = this.opts;
    const finalState = (pos: Vec3): string => this.origBlockString(mx + pos[0], my + pos[1], mz + pos[2]);
    const out: ConnectorCell[] = [];
    for (const edge of this.plan.edges) {
      const seam = this.seams.get(edge.edgeId)!;
      if (edge.parent === slot.index) {
        out.push({
          pos: seam.parentLocal,
          orientation: edgeOrientation(edge.dir).parent,
          nbt: jigsawNbt(outConnectorName(edge.edgeId), inConnectorName(edge.edgeId), `${namespace}:${base}/${edgePoolLeaf(edge.edgeId)}`, finalState(seam.parentLocal)),
        });
      }
      if (edge.child === slot.index) {
        out.push({
          pos: seam.childLocal,
          orientation: edgeOrientation(edge.dir).child,
          nbt: jigsawNbt(inConnectorName(edge.edgeId), 'minecraft:empty', 'minecraft:empty', finalState(seam.childLocal)),
        });
      }
    }
    return out;
  }

  /** Defensive check: the connectors we build must, through the SHARED geometry, land the child
   *  exactly tiling its original slot (no rotation). A failure is a programming error. */
  private assertEdgeGeometry(edge: SplitEdge, P: SplitSlot, C: SplitSlot, seam: Seam): void {
    const ori = edgeOrientation(edge.dir);
    const stub = { name: '', target: '', pool: '', finalState: AIR, joint: 'aligned' as const, selectionPriority: 0, placementPriority: 0 };
    const parent: JigsawConnector = { ...stub, pos: seam.parentLocal, orientation: ori.parent };
    const child: JigsawConnector = { ...stub, pos: seam.childLocal, orientation: ori.child };
    const parentPlacement: Placement = { offset: P.min, quarterTurns: 0 };
    const result = solveAttachment(parent, parentPlacement, child);
    const ok =
      result !== null &&
      result.quarterTurns === 0 &&
      Math.round(result.offset[0]) === C.min[0] &&
      Math.round(result.offset[1]) === C.min[1] &&
      Math.round(result.offset[2]) === C.min[2];
    if (!ok) {
      throw new Error(`split connector geometry mismatch on edge ${edge.edgeId} (dir ${edge.dir}): expected offset ${C.min.join(',')}, got ${result ? result.offset.join(',') : 'null'}`);
    }
  }
}

/** The jigsaw block-entity NBT compound. */
function jigsawNbt(name: string, target: string, pool: string, finalState: string): Record<string, unknown> {
  return {
    id: JIGSAW_BLOCK,
    name,
    target,
    pool,
    final_state: finalState,
    joint: 'aligned',
    selection_priority: 0,
    placement_priority: 0,
  };
}

/** Build the full file set (piece `.nbt`s + pools + structure/set/biome) for a split export.
 *  `plan` must be `oversized` (the caller gates on that). */
export function splitToJigsaw(raw: RawStructure, plan: SplitPlan, opts: SplitToJigsawOptions): SplitResult {
  return new JigsawSplitter(raw, plan, opts).build();
}
