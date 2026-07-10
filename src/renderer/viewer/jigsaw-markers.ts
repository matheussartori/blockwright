// Pure connector-marker math for the Jigsaw Lab overlay: where each jigsaw block's
// gizmo sits in world space, which way its arrow points, and which color its pool
// gets. No Three.js — the geometry comes from shared/jigsaw so markers land exactly
// where the assembler placed the pieces; jigsaw-overlay.ts turns these into meshes.
import type { JigsawConnector } from '@/shared/types';
import {
  type Direction,
  type Placement,
  type Vec3,
  worldCenter,
  worldFront,
} from '@/shared/jigsaw';

/** One connector gizmo: an anchor cube at the jigsaw cell + an arrow along its front. */
export interface ConnectorMarker {
  /** Stable key (`<pieceId>:<connectorIndex>`) so the UI can focus a marker from a list row. */
  key: string;
  /** World-space center of the jigsaw block's cell. */
  center: Vec3;
  /** World-facing front direction (the side a child piece attaches to). */
  front: Direction;
  pool: string;
  color: number;
}

/** A placed piece reduced to what markers need (viewer's AssemblyPiece fits). */
export interface MarkerPiece {
  /** Placement id ("root" for the single-structure case / the assembly root). */
  id: string;
  jigsaws: JigsawConnector[];
  placement: Placement;
}

/** Distinct hues that read against the viewer background without colliding with the
 *  diff overlay's semantic green/red/yellow. Pools cycle through them. */
export const POOL_PALETTE = [
  0x5b8def, // blue
  0xe8a13d, // amber
  0x46c78c, // green
  0xd96bb1, // pink
  0x8f6ef2, // violet
  0x3fb8c9, // teal
  0xc9c04a, // olive
  0xe07a5f, // coral
];

/** Deterministic pool → color assignment: sorted distinct ids cycle the palette, so
 *  the same file always shows the same colors regardless of connector order. */
export function poolColors(pools: Iterable<string>): Map<string, number> {
  const distinct = [...new Set([...pools])].sort();
  const map = new Map<string, number>();
  distinct.forEach((id, i) => map.set(id, POOL_PALETTE[i % POOL_PALETTE.length]));
  return map;
}

/** Overlay sanity cap: past this the gizmos stop aiding authoring and start melting
 *  draw calls (a depth-8 assembly can reach 200 pieces). */
export const MAX_MARKERS = 512;

/** Markers for every connector of every placed piece, in world space. Pool colors
 *  are assigned across ALL pieces so the same pool matches everywhere. */
export function buildConnectorMarkers(pieces: MarkerPiece[]): ConnectorMarker[] {
  const colors = poolColors(pieces.flatMap((p) => p.jigsaws.map((j) => j.pool)));
  const markers: ConnectorMarker[] = [];
  for (const piece of pieces) {
    for (let i = 0; i < piece.jigsaws.length; i++) {
      if (markers.length >= MAX_MARKERS) return markers;
      const j = piece.jigsaws[i];
      markers.push({
        key: `${piece.id}:${i}`,
        center: worldCenter(j.pos, piece.placement),
        front: worldFront(j, piece.placement),
        pool: j.pool,
        color: colors.get(j.pool) ?? POOL_PALETTE[0],
      });
    }
  }
  return markers;
}
