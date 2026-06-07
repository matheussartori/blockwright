import { describe, expect, it } from 'vitest';
import { detectFloors, type FloorDetectInput } from '../detect-floors';

const X = 7, Z = 7;

/** Fill a full slab layer (every footprint cell) at y. */
function slab(y: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let x = 0; x < X; x++) for (let z = 0; z < Z; z++) out.push([x, y, z]);
  return out;
}

/** A hollow wall ring (perimeter only) at y. */
function walls(y: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let x = 0; x < X; x++) for (let z = 0; z < Z; z++) {
    if (x === 0 || x === X - 1 || z === 0 || z === Z - 1) out.push([x, y, z]);
  }
  return out;
}

/** A wall ring at y with a couple of perimeter cells punched out (windows/doors) — an
 *  ABOVE-GRADE storey. */
function windowed(y: number): [number, number, number][] {
  return walls(y).filter((c) => !(c[0] === 0 && (c[2] === 2 || c[2] === 3)));
}

/** A centered square ring at y, inset `margin` cells from the edge — stack these with a
 *  growing margin to get a roof whose cross-section shrinks toward the ridge. */
function ring(y: number, margin: number): [number, number, number][] {
  const lo = margin;
  const hi = X - 1 - margin;
  const out: [number, number, number][] = [];
  for (let x = lo; x <= hi; x++) for (let z = lo; z <= hi; z++) {
    if (x === lo || x === hi || z === lo || z === hi) out.push([x, y, z]);
  }
  return out;
}

describe('detectFloors', () => {
  it('finds the storeys of a two-floor walled box', () => {
    // Slabs at y=0 and y=4, hollow walls between and above (no roof slab).
    const solids = [
      ...slab(0), ...walls(1), ...walls(2), ...walls(3),
      ...slab(4), ...walls(5), ...walls(6), ...walls(7),
    ];
    const floors = detectFloors({ size: [X, 9, Z], solids });
    expect(floors).toHaveLength(2);
    expect(floors[0]).toMatchObject({ from: 0, to: 3, role: 'ground' });
    expect(floors[1]).toMatchObject({ from: 4, to: 8, role: 'upper' });
  });

  it('does not mistake hollow wall rings for floors', () => {
    const solids = [...walls(0), ...walls(1), ...walls(2), ...walls(3), ...walls(4)];
    expect(detectFloors({ size: [X, 6, Z], solids })).toEqual([]);
  });

  it('reports a single ground floor for one slab', () => {
    const floors = detectFloors({ size: [X, 6, Z], solids: [...slab(0), ...walls(1), ...walls(2)] });
    expect(floors).toHaveLength(1);
    expect(floors[0]).toMatchObject({ from: 0, to: 5, role: 'ground' });
  });

  it('returns nothing for empty or too-short structures', () => {
    expect(detectFloors({ size: [X, 9, Z], solids: [] })).toEqual([]);
    expect(detectFloors({ size: [X, 2, Z], solids: slab(0) })).toEqual([]);
    expect(detectFloors({ size: [0, 9, 0], solids: [] })).toEqual([]);
  });

  it('labels a tapering top storey as a roof', () => {
    // Ground (windowed walls) + an attic floor with a pitched roof shrinking above it.
    const solids = [
      ...slab(0), ...windowed(1), ...windowed(2), ...windowed(3),
      ...slab(4), ...ring(5, 0), ...ring(6, 1), ...ring(7, 2),
    ];
    const floors = detectFloors({ size: [X, 9, Z], solids });
    expect(floors).toHaveLength(2);
    expect(floors[0]).toMatchObject({ from: 0, role: 'ground' });
    expect(floors[1]).toMatchObject({ from: 4, role: 'roof' });
  });

  it('labels a sealed bottom storey under an open one as a basement', () => {
    // Buried bottom (full walls, no openings), windowed ground + upper above it.
    const solids = [
      ...slab(0), ...walls(1), ...walls(2), ...walls(3),
      ...slab(4), ...windowed(5), ...windowed(6), ...windowed(7),
      ...slab(8), ...windowed(9), ...windowed(10), ...windowed(11),
    ];
    const floors = detectFloors({ size: [X, 13, Z], solids });
    expect(floors.map((f) => f.role)).toEqual(['basement', 'ground', 'upper']);
  });

  it('numbers floors bottom-up, ignoring any prior name', () => {
    const floors = detectFloors({ size: [X, 9, Z], solids: [...slab(0), ...slab(4)] });
    expect(floors.map((f) => f.name)).toEqual(['Floor 1', 'Floor 2']);
  });

  it('gives stable ids that round-trip an edit', () => {
    const input: FloorDetectInput = { size: [X, 9, Z], solids: [...slab(0), ...slab(4)] };
    const floors = detectFloors(input);
    expect(floors.map((f) => f.id)).toEqual(['floor-1', 'floor-2']);
  });
});
