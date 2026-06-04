// The Blockwright "authoring JSON" — the loose, untyped structure the AI emits
// (see knowledge/nbt/01-nbt-format.md). It mirrors the Minecraft structure tag
// tree but without the NBT type rules (the compiler applies those) and with the
// air-omission convenience. These are the type-only contracts shared across the
// authoring compile pipeline.

export interface AuthoringStructure {
  DataVersion?: number;
  size?: [number, number, number];
  palette?: AuthoringPaletteEntry[];
  /** Volumetric build ops, expanded to blocks before compile. Applied in order
   *  (later ops overwrite earlier cells), then any explicit `blocks` overlay on
   *  top. Lets the model describe big builds in ~ops instead of ~thousands of
   *  per-block entries — the dominant generation cost (see knowledge 00). */
  ops?: AuthoringOp[];
  blocks?: AuthoringBlock[];
  entities?: AuthoringEntity[];
}

/** A volumetric build op. `fill` = solid box; `hollow` = 6-face shell; `walls` =
 *  the 4 vertical sides only (no floor/ceiling); `line` = a 3D line between two
 *  cells; `block` = a single cell (the only op that may carry block-entity nbt).
 *  Write an air palette index to carve.
 *
 *  Transform ops operate on cells ALREADY placed by earlier ops (apply order
 *  matters) and rewrite orientation blockstates as they copy — so a symmetric
 *  build can be authored once and reflected/rotated/tiled with stairs, doors and
 *  logs pointing the right way (the #1 manual-symmetry bug). `mirror` reflects a
 *  region onto itself across its centre plane; `rotate` turns it about a pivot;
 *  `repeat` tiles it along an axis. `roof` synthesises a pitched stair roof. */
export type AuthoringOp =
  | { op: 'fill' | 'hollow' | 'walls'; from: [number, number, number]; to: [number, number, number]; state: number }
  | { op: 'line'; from: [number, number, number]; to: [number, number, number]; state: number }
  | { op: 'block'; pos: [number, number, number]; state: number; nbt?: Record<string, unknown> }
  | { op: 'mirror'; from: [number, number, number]; to: [number, number, number]; axis: 'x' | 'z' }
  | { op: 'rotate'; from: [number, number, number]; to: [number, number, number]; turns: number; pivot?: [number, number] }
  | { op: 'repeat'; from: [number, number, number]; to: [number, number, number]; axis: 'x' | 'y' | 'z'; step: number; count: number }
  | { op: 'roof'; from: [number, number, number]; to: [number, number, number]; state: number; style?: 'gable' | 'hip'; ridge?: 'x' | 'z'; fill?: number }
  | { op: 'stairs'; from: [number, number, number]; to: [number, number, number]; state: number; fill?: number; clear?: number }
  | { op: 'template'; name: string; from: [number, number, number]; to: [number, number, number]; params?: Record<string, unknown> };

export interface AuthoringPaletteEntry {
  Name: string;
  Properties?: Record<string, unknown>;
}

export interface AuthoringBlock {
  state: number;
  pos: [number, number, number];
  /** Block-entity NBT (chests, signs, …). Encoded best-effort; the preview
   *  ignores it (it renders from block name + properties), so type fidelity here
   *  matters only if the file is later opened in Minecraft. */
  nbt?: Record<string, unknown>;
}

export interface AuthoringEntity {
  pos: [number, number, number];
  blockPos: [number, number, number];
  nbt?: Record<string, unknown>;
}
