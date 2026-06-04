// Orientation blockstate transforms for the mirror / rotate ops. Copying a region
// symmetrically must rewrite directional blockstates, or stairs/doors/logs point
// the wrong way after the copy. These rewrite one property at a time; the
// transform ops apply them per copied cell. Convention matches shared/jigsaw.ts:
// CW = clockwise viewed from above.

const FACING_CW = { north: 'east', east: 'south', south: 'west', west: 'north' } as const;
export type Horiz = keyof typeof FACING_CW;
export const isHoriz = (v: unknown): v is Horiz =>
  v === 'north' || v === 'south' || v === 'east' || v === 'west';

const SHAPE_MIRROR: Record<string, string> = {
  inner_left: 'inner_right', inner_right: 'inner_left',
  outer_left: 'outer_right', outer_right: 'outer_left',
};

export type PropXform = { kind: 'mirror'; axis: 'x' | 'z' } | { kind: 'rotate'; turns: number };

export function rotFacing(f: Horiz, q: number): Horiz {
  let out: Horiz = f;
  const n = (((q % 4) + 4) % 4);
  for (let i = 0; i < n; i++) out = FACING_CW[out];
  return out;
}

export function mirrorFacing(f: Horiz, axis: 'x' | 'z'): Horiz {
  if (axis === 'x') return f === 'east' ? 'west' : f === 'west' ? 'east' : f;
  return f === 'north' ? 'south' : f === 'south' ? 'north' : f;
}

/** Rewrite a block's orientation properties under a mirror/rotate, so the copied
 *  geometry stays physically consistent (facing/axis/shape/hinge/rotation). */
export function transformProps(
  props: Record<string, unknown> | undefined,
  t: PropXform,
): Record<string, unknown> | undefined {
  if (!props) return props;
  const out: Record<string, unknown> = { ...props };
  if (isHoriz(out.facing)) {
    out.facing = t.kind === 'rotate' ? rotFacing(out.facing, t.turns) : mirrorFacing(out.facing, t.axis);
  }
  if ((out.axis === 'x' || out.axis === 'z') && t.kind === 'rotate' && (((t.turns % 2) + 2) % 2) === 1) {
    out.axis = out.axis === 'x' ? 'z' : 'x';
  }
  if (typeof out.shape === 'string' && t.kind === 'mirror' && SHAPE_MIRROR[out.shape]) {
    out.shape = SHAPE_MIRROR[out.shape];
  }
  if ((out.hinge === 'left' || out.hinge === 'right') && t.kind === 'mirror') {
    out.hinge = out.hinge === 'left' ? 'right' : 'left';
  }
  if (out.rotation !== undefined) {
    const r = Number(out.rotation);
    if (Number.isFinite(r)) {
      const nr = t.kind === 'rotate' ? (((r + 4 * t.turns) % 16) + 16) % 16 : (((16 - r) % 16) + 16) % 16;
      out.rotation = String(nr);
    }
  }
  return out;
}
