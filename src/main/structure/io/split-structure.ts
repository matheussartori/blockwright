// Cut an oversized structure into a JIGSAW assembly that reassembles voxel-perfectly in
// Minecraft. Each tree edge (shared/domain/split) drops ONE jigsaw connector in the parent
// piece and one in the child; vanilla replaces each jigsaw with its own `final_state`, so we
// set each to the ORIGINAL block at that cell and the only cost is the (at most) two cells
// per edge — placed away from block entities so no NBT is lost. The geometry round-trips
// through `solveAttachment`, so the in-app assembler (and worldgen) reproduce the placement.
import {
  childSeamCell,
  edgeOrientation,
  edgePoolLeaf,
  faceAxes,
  inConnectorName,
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
import type { AuthoringBlock, AuthoringPaletteEntry } from '../authoring/types';
import { encodeStructure } from '../authoring/nbt-encode';
import { biomeTagJson, singleElementPoolJson, structureJson, structureSetJson } from '../../export/worldgen-json';

const JIGSAW_BLOCK = 'minecraft:jigsaw';
/** Far pieces are culled beyond this. The vanilla JigsawStructure codec rejects the def when
 *  `max_distance_from_center` + a terrain-adaptation margin exceeds 128 (the margin is 12 for
 *  any adaptation other than `none`), so we cap at 116 — the largest value that always loads. */
const SPLIT_MAX_DISTANCE = 116;

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

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

/** The connectors a piece carries (resolved from the seam choices), keyed by local pos. */
interface ConnectorCell {
  pos: Vec3;
  orientation: string;
  nbt: Record<string, unknown>;
}

/** Build the full file set (piece `.nbt`s + pools + structure/set/biome) for a split export.
 *  `plan` must be `oversized`; the caller (export) gates on that. */
export function splitToJigsaw(raw: RawStructure, plan: SplitPlan, opts: SplitToJigsawOptions): SplitResult {
  const { namespace, base } = opts;
  const warnings: ValidationIssue[] = [];

  // Original-coordinate lookups: which palette index sits at each cell, and which cells hold
  // a block entity (so we keep connectors off them — `final_state` restores blocks, not NBT).
  const blockMap = new Map<string, number>();
  for (const b of raw.blocks) blockMap.set(key(b.pos[0], b.pos[1], b.pos[2]), b.state);
  const beMap = new Map<string, RawBlockEntity>();
  for (const be of raw.blockEntities ?? []) beMap.set(key(be.pos[0], be.pos[1], be.pos[2]), be);

  const origBlockString = (x: number, y: number, z: number): string => {
    const s = blockMap.get(key(x, y, z));
    return s === undefined ? AIR : blockStateString(raw.palette[s]);
  };

  // --- Choose one seam cell per edge (shared by the parent's outbound + child's inbound) ----
  const usedCells = new Map<number, Set<string>>(); // slot index → reserved LOCAL pos keys
  const reserve = (slot: number, local: Vec3): void => {
    let set = usedCells.get(slot);
    if (!set) usedCells.set(slot, (set = new Set()));
    set.add(key(local[0], local[1], local[2]));
  };
  const isFree = (slot: number, local: Vec3): boolean => !usedCells.get(slot)?.has(key(local[0], local[1], local[2]));

  interface Seam {
    parentLocal: Vec3;
    childLocal: Vec3;
  }
  const seams = new Map<string, Seam>();
  for (const edge of plan.edges) {
    const P = plan.slots[edge.parent];
    const C = plan.slots[edge.child];
    const seam = chooseSeam(P, C, edge.dir, beMap, isFree, warnings);
    seams.set(edge.edgeId, seam);
    reserve(P.index, seam.parentLocal);
    reserve(C.index, seam.childLocal);
    assertEdgeGeometry(edge, P, C, seam);
  }

  // --- Build each piece ---------------------------------------------------------------------
  const pieceLocation = (slot: SplitSlot): string => `${namespace}:${base}/${pieceName(slot)}`;
  const edgeById = new Map(plan.edges.map((e) => [e.edgeId, e]));
  const childSlotOfEdge = (edgeId: string): SplitSlot => plan.slots[edgeById.get(edgeId)!.child];

  const pieceBuffers = new Map<number, Buffer>();
  for (const slot of plan.slots) {
    pieceBuffers.set(slot.index, encodeStructure(buildPiece(slot, plan, seams, blockMap, beMap, raw, origBlockString, namespace, base, opts.dataVersion)));
  }

  // --- Assemble the ordered file list (same paths the preview lists) ------------------------
  const size = Math.min(MAX_JIGSAW_DEPTH, plan.depth + 1);
  const files: SplitFile[] = [];
  for (const spec of splitFileSpecs(namespace, base, opts.version, plan)) {
    if (spec.ref.type === 'piece') {
      files.push({ rel: spec.rel, kind: spec.kind, buffer: pieceBuffers.get(spec.ref.slot)! });
    } else if (spec.ref.type === 'start_pool') {
      files.push({ rel: spec.rel, kind: spec.kind, json: singleElementPoolJson(`${namespace}:${base}/start`, pieceLocation(plan.slots[plan.root])) });
    } else if (spec.ref.type === 'edge_pool') {
      const poolId = `${namespace}:${base}/${edgePoolLeaf(spec.ref.edgeId)}`;
      files.push({ rel: spec.rel, kind: spec.kind, json: singleElementPoolJson(poolId, pieceLocation(childSlotOfEdge(spec.ref.edgeId))) });
    } else if (spec.ref.type === 'structure') {
      files.push({ rel: spec.rel, kind: spec.kind, json: structureJson(namespace, base, opts.worldgen, { size, maxDistance: SPLIT_MAX_DISTANCE }) });
    } else if (spec.ref.type === 'structure_set') {
      files.push({ rel: spec.rel, kind: spec.kind, json: structureSetJson(namespace, base, opts.worldgen) });
    } else {
      files.push({ rel: spec.rel, kind: spec.kind, json: biomeTagJson(opts.worldgen) });
    }
  }

  return { files, warnings };
}

/** Slice one slot out of the raw structure (rebased to local coords), re-attach its block
 *  entities, and inject this piece's jigsaw connectors. Returns an `encodeStructure` input. */
function buildPiece(
  slot: SplitSlot,
  plan: SplitPlan,
  seams: Map<string, { parentLocal: Vec3; childLocal: Vec3 }>,
  blockMap: Map<string, number>,
  beMap: Map<string, RawBlockEntity>,
  raw: RawStructure,
  origBlockString: (x: number, y: number, z: number) => string,
  namespace: string,
  base: string,
  dataVersion: number,
): Parameters<typeof encodeStructure>[0] {
  const [mx, my, mz] = slot.min;
  const [sx, sy, sz] = slot.size;

  // Resolve this piece's connectors from the per-edge seams.
  const connectors: ConnectorCell[] = [];
  for (const edge of plan.edges) {
    const seam = seams.get(edge.edgeId)!;
    if (edge.parent === slot.index) {
      const pos = seam.parentLocal;
      const fs = origBlockString(mx + pos[0], my + pos[1], mz + pos[2]);
      connectors.push({
        pos,
        orientation: edgeOrientation(edge.dir).parent,
        nbt: jigsawNbt(outConnectorName(edge.edgeId), inConnectorName(edge.edgeId), `${namespace}:${base}/${edgePoolLeaf(edge.edgeId)}`, fs),
      });
    }
    if (edge.child === slot.index) {
      const pos = seam.childLocal;
      const fs = origBlockString(mx + pos[0], my + pos[1], mz + pos[2]);
      connectors.push({
        pos,
        orientation: edgeOrientation(edge.dir).child,
        nbt: jigsawNbt(inConnectorName(edge.edgeId), '', 'minecraft:empty', fs),
      });
    }
  }
  const connectorAt = new Map(connectors.map((c) => [key(c.pos[0], c.pos[1], c.pos[2]), c]));

  // Per-piece palette interning (keeps each piece's palette minimal).
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
  for (const b of raw.blocks) {
    const [x, y, z] = b.pos;
    if (x < mx || x >= mx + sx || y < my || y >= my + sy || z < mz || z >= mz + sz) continue;
    const local: Vec3 = [x - mx, y - my, z - mz];
    if (connectorAt.has(key(local[0], local[1], local[2]))) continue; // a connector overrides it
    const state = intern(raw.palette[b.state]);
    const be = beMap.get(key(x, y, z));
    blocks.push(be ? { state, pos: local, nbt: { id: be.id, ...be.nbt } } : { state, pos: local });
  }

  // Inject the connectors (they may sit on a cell that was air/omitted in the source).
  for (const c of connectors) {
    const state = intern({ Name: JIGSAW_BLOCK, Properties: { orientation: c.orientation } });
    blocks.push({ state, pos: c.pos, nbt: c.nbt });
  }

  return { dataVersion, size: slot.size, palette, blocks, entities: [] };
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

/** Pick a seam cell on the shared face of P→C: prefer the face CENTER among "clean" cells
 *  (no block entity in either piece), falling back to the least-bad cell with a warning. */
function chooseSeam(
  P: SplitSlot,
  C: SplitSlot,
  dir: Direction,
  beMap: Map<string, RawBlockEntity>,
  isFree: (slot: number, local: Vec3) => boolean,
  warnings: ValidationIssue[],
): { parentLocal: Vec3; childLocal: Vec3 } {
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

  let fallback: { parentLocal: Vec3; childLocal: Vec3 } | null = null;
  for (const { a, b } of candidates) {
    const parentLocal = parentSeamCell(dir, P.size, a, b);
    const childLocal = childSeamCell(dir, C.size, a, b);
    if (!isFree(P.index, parentLocal) || !isFree(C.index, childLocal)) continue; // cell already a connector
    const pBE = beMap.has(key(P.min[0] + parentLocal[0], P.min[1] + parentLocal[1], P.min[2] + parentLocal[2]));
    const cBE = beMap.has(key(C.min[0] + childLocal[0], C.min[1] + childLocal[1], C.min[2] + childLocal[2]));
    if (!pBE && !cBE) return { parentLocal, childLocal }; // clean — best case (center-first)
    fallback ??= { parentLocal, childLocal };
  }
  if (fallback) {
    warnings.push({ level: 'warning', code: 'split_block_entity', detail: `${P.min.join(',')}↔${C.min.join(',')}` });
    return fallback;
  }
  // Pathologically thin piece: every face cell is already a connector. Reuse the center cell
  // (overwrites another connector — rare, surfaced as a warning).
  warnings.push({ level: 'warning', code: 'split_block_entity', detail: `${P.min.join(',')}↔${C.min.join(',')}` });
  return { parentLocal: parentSeamCell(dir, P.size, 0, 0), childLocal: childSeamCell(dir, C.size, 0, 0) };
}

/** Defensive check: the connectors we build must, through the SHARED geometry, land the child
 *  exactly tiling its original slot (no rotation). A failure is a programming error. */
function assertEdgeGeometry(edge: SplitEdge, P: SplitSlot, C: SplitSlot, seam: { parentLocal: Vec3; childLocal: Vec3 }): void {
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
