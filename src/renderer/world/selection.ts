// Pure geometry for the world editor's box selection (two picked corners spanning an
// inclusive region, plus post-commit face adjustments). Kept free of store/viewer state
// so the corner/face math is unit-testable.

/** An inclusive axis-aligned block region (min ≤ max on every axis). */
export interface SelectionRegion {
  min: [number, number, number];
  max: [number, number, number];
}

/** The inclusive region spanned by two picked corner cells (any order). */
export function spanRegion(a: [number, number, number], b: [number, number, number]): SelectionRegion {
  return {
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  };
}

/** Block count of an inclusive region. */
export function regionVolume(r: SelectionRegion): number {
  return (r.max[0] - r.min[0] + 1) * (r.max[1] - r.min[1] + 1) * (r.max[2] - r.min[2] + 1);
}

/** Move the region's top or bottom face to world Y `y`, clamped so the box never inverts
 *  (a face stops at its opposite face) and, when `bounds` is given, never leaves the
 *  world's build range (both inclusive). Returns a new region; the other axes are kept. */
export function adjustFaceY(
  r: SelectionRegion,
  face: 'top' | 'bottom',
  y: number,
  bounds?: [number, number],
): SelectionRegion {
  let clamped = Math.round(y);
  if (bounds) clamped = Math.max(bounds[0], Math.min(bounds[1], clamped));
  const min: [number, number, number] = [...r.min];
  const max: [number, number, number] = [...r.max];
  if (face === 'top') max[1] = Math.max(min[1], clamped);
  else min[1] = Math.min(max[1], clamped);
  return { min, max };
}
