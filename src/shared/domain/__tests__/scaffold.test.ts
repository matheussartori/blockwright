import { describe, it, expect } from 'vitest';
import { splitPlan, type Vec3 } from '../split';
import { scaffoldFunction, scaffoldLayout } from '../scaffold';

const LIMIT = 48;

describe('scaffoldLayout', () => {
  it('anchors each piece at its true x/z so they tile into the whole build', () => {
    const plan = splitPlan([120, 40, 120] as Vec3, LIMIT); // 3×1×3 = 9 pieces, no vertical split
    const layout = scaffoldLayout(plan);
    expect(layout).toHaveLength(plan.slots.length);

    for (const { slot, origin, block, pos } of layout) {
      // x/z follow the slot's real min; with no vertical split every piece is the bottom layer,
      // so the SAVE block sits below (y=0) and the geometry lands at origin.y = 1.
      expect(origin[0]).toBe(slot.min[0]);
      expect(origin[2]).toBe(slot.min[2]);
      expect(origin[1]).toBe(1);
      expect(block).toEqual([slot.min[0], 0, slot.min[2]]);
      expect(pos).toEqual([0, 1, 0]);
    }
    // Pieces tile: every X/Z corner pair is distinct (no two pieces share a footprint corner).
    const corners = layout.map((l) => `${l.origin[0]},${l.origin[2]}`);
    expect(new Set(corners).size).toBe(corners.length);
  });

  it('stacks a vertical split SEAMLESSLY, sending the upper layer SAVE block to a side', () => {
    const plan = splitPlan([8, 96, 8] as Vec3, LIMIT); // 1×2×1 = 2 stacked pieces (y split 48|48)
    const layout = scaffoldLayout(plan);
    const lower = layout.find((l) => l.slot.j === 0)!;
    const upper = layout.find((l) => l.slot.j === 1)!;

    // The two pieces stack with NO gap: the upper layer continues right where the lower ends.
    expect(lower.origin[1]).toBe(1);
    expect(upper.origin[1]).toBe(lower.origin[1] + lower.slot.size[1]);

    // The lower piece's SAVE block sits below it; the upper piece's goes to the (free) west side
    // so it doesn't break the stack.
    expect(lower.block).toEqual([lower.origin[0], 0, lower.origin[2]]);
    expect(lower.pos).toEqual([0, 1, 0]);
    expect(upper.block).toEqual([upper.origin[0] - 1, upper.origin[1], upper.origin[2]]);
    expect(upper.pos).toEqual([1, 0, 0]);
  });

  it('always captures each piece exactly (block + pos resolves to the piece origin)', () => {
    for (const size of [[120, 40, 120], [8, 96, 8], [60, 96, 60]] as Vec3[]) {
      for (const { origin, block, pos } of scaffoldLayout(splitPlan(size, LIMIT))) {
        expect([block[0] + pos[0], block[1] + pos[1], block[2] + pos[2]]).toEqual(origin);
      }
    }
  });
});

describe('scaffoldFunction', () => {
  it('emits a place + a SAVE structure block per piece, sized to each slot', () => {
    const plan = splitPlan([60, 8, 8] as Vec3, LIMIT); // 2×1×1 = 2 pieces (x split 30|30)
    const text = scaffoldFunction('mybuild', 'mybuild', plan);

    const placeLines = text.split('\n').filter((l) => l.startsWith('place template '));
    const saveLines = text.split('\n').filter((l) => l.includes('structure_block'));
    expect(placeLines).toHaveLength(2);
    expect(saveLines).toHaveLength(2);

    // Each piece is referenced by its canonical id, and SAVE blocks carry the slot size.
    expect(text).toContain('mybuild:mybuild/p_0_0_0');
    expect(text).toContain('mybuild:mybuild/p_1_0_0');
    for (const line of saveLines) {
      expect(line).toMatch(/mode:"SAVE"/);
      expect(line).toMatch(/sizeX:30,sizeY:8,sizeZ:8/); // a 60-wide axis splits into 30|30
      expect(line).toMatch(/posY:1/); // bottom layer → box sits above the structure block
      expect(line).toMatch(/showboundingbox:1b/);
    }
    // Usage header is present (comment lines).
    expect(text).toMatch(/^# Blockwright in-world editing scaffold/m);
  });

  it('puts a vertical split upper-layer SAVE block to the side (posX), not in a gap row', () => {
    const plan = splitPlan([8, 96, 8] as Vec3, LIMIT); // 1×2×1 stacked
    const saveLines = scaffoldFunction('tower', 'tower', plan)
      .split('\n')
      .filter((l) => l.includes('structure_block'));
    expect(saveLines).toHaveLength(2);
    expect(saveLines.some((l) => /posX:0,posY:1,posZ:0/.test(l))).toBe(true); // lower: below
    expect(saveLines.some((l) => /posX:1,posY:0,posZ:0/.test(l))).toBe(true); // upper: west side
  });
});
