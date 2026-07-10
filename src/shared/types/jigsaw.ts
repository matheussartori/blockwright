// Jigsaw assembly contracts: the plan (placed pieces + warnings) the planner
// produces and the renderer places, plus the options and the manual-mode
// candidate. The shared rotation convention lives in shared/jigsaw.ts (runtime);
// these are the type-only data shapes that cross the IPC boundary.

/** A structure placed in the assembly: which file, where, and its Y rotation.
 *  Rotation is in quarter-turns about +Y (0..3); offset is the world position of
 *  the piece's local origin (after rotation), in block units. */
export interface PlacedPiece {
  /** Stable id for this placement (root is "root"). */
  id: string;
  /** The pieces's structure id (namespace:path), for display. */
  structureId: string;
  /** Absolute path to the structure `.nbt`, so the renderer can load its meshes. */
  structurePath: string;
  offset: [number, number, number];
  quarterTurns: 0 | 1 | 2 | 3;
  /** Placement depth from the root (root = 0). */
  depth: number;
}

export type JigsawWarningKind =
  | 'missing-structure'
  | 'empty-pool'
  | 'unmatched-target'
  | 'overlap'
  | 'depth-limit'
  | 'unsupported-orientation'
  | 'fallback-expansion';

/** A problem found while assembling/validating, surfaced to the user. */
export interface JigsawWarning {
  kind: JigsawWarningKind;
  message: string;
  /** Optional placement id the warning relates to. */
  pieceId?: string;
}

export interface JigsawPlan {
  pieces: PlacedPiece[];
  warnings: JigsawWarning[];
}

export interface AssembleOptions {
  /** Deterministic seed; same seed + structure ⇒ same assembly. */
  seed: number;
  /** Maximum recursion depth from the root piece. */
  maxDepth: number;
}

/** One element of a resolved template pool, for the Jigsaw Lab's pool inspector. */
export interface JigsawPoolElementInfo {
  /** The element's structure id (namespace:path); "(empty)" elements keep theirs too. */
  structureId: string;
  /** Whether the element's `.nbt` exists on disk (always true for empty elements). */
  exists: boolean;
  weight: number;
  /** A terminal element (empty/feature/unknown) — placeable as "stop here". */
  empty: boolean;
}

/** A template pool as the Jigsaw Lab presents it: existence, elements and fallback. */
export interface JigsawPoolInfo {
  id: string;
  /** Whether the pool JSON resolved at all. */
  exists: boolean;
  fallback: string | null;
  /** Whether the fallback pool resolves (null when there is no fallback). */
  fallbackExists: boolean | null;
  elements: JigsawPoolElementInfo[];
}

/** One candidate piece that could attach to a given connector (manual mode). */
export interface JigsawCandidate {
  structureId: string;
  structurePath: string;
  weight: number;
  /** The placement that would attach this candidate to the source connector. */
  placement: PlacedPiece;
}
