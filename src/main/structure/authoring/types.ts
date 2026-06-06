// The Blockwright "authoring JSON" — the loose, untyped structure the AI emits
// (see knowledge/nbt/01-nbt-format.md). It mirrors the Minecraft structure tag
// tree but without the NBT type rules (the compiler applies those) and with the
// air-omission convenience. These are the type-only contracts shared across the
// authoring compile pipeline.
import type { FloorRole } from '@/shared/types';

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
  /** The build's storeys, labelled by role. The compiler reads this (not geometry)
   *  to find the ground-floor level ("grade") so the air-fill keeps the basement
   *  surround as structure_void while the interior + above-grade facade/balcony
   *  become air. Declared by the model per emit; the user's Floor plan overrides it
   *  at compile time. See `gradeFromFloors`. */
  floors?: AuthoringFloor[];
}

/** A storey in `AuthoringStructure.floors`: a role-tagged inclusive y range. */
export interface AuthoringFloor {
  name?: string;
  role: FloorRole;
  from: number;
  to: number;
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

/** Every op discriminant, in one place — the AI tool schema's op enum derives from
 *  this instead of restating the list. The assertion below makes the build fail if
 *  this and the AuthoringOp union ever drift apart. */
export const OP_NAMES = ['fill', 'hollow', 'walls', 'line', 'block', 'mirror', 'rotate', 'repeat', 'roof', 'stairs', 'template'] as const;
export type OpName = (typeof OP_NAMES)[number];

// Compile-time guard: OP_NAMES ≡ AuthoringOp['op'] (both directions). If a new op is
// added to the union but not here (or vice-versa), this alias resolves to a type that
// can't be `true`, and the line below fails to compile.
type AssertTrue<T extends true> = T;
// Exported only so the alias counts as "used"; intentionally NOT re-exported by the
// authoring barrel, so it stays internal to this module.
export type _OpNamesInSync = AssertTrue<
  OpName extends AuthoringOp['op'] ? (AuthoringOp['op'] extends OpName ? true : false) : false
>;

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
