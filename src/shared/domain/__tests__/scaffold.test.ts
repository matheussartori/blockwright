import { describe, it, expect } from 'vitest';
import { splitPlan, type Vec3 } from '../split';
import { scaffoldFunction, scaffoldLayout } from '../scaffold';

const LIMIT = 48;

describe('scaffoldLayout', () => {
  it('anchors each piece at its true x/z so they tile into the whole build', () => {
    const plan = splitPlan([120, 40, 120] as Vec3, LIMIT); // 3×1×3 = 9 pieces, no vertical split
    const layout = scaffoldLayout(plan);
    expect(layout).toHaveLength(plan.slots.length);

    for (const { slot, anchor } of layout) {
      // x/z follow the slot's real min; with no vertical split the SAVE block sits at y=0
      // (the build geometry lands at anchor.y + 1 = 1).
      expect(anchor[0]).toBe(slot.min[0]);
      expect(anchor[2]).toBe(slot.min[2]);
      expect(anchor[1]).toBe(0);
    }
    // Pieces tile: every X/Z corner pair is distinct (no two pieces share a footprint corner).
    const corners = layout.map((l) => `${l.anchor[0]},${l.anchor[2]}`);
    expect(new Set(corners).size).toBe(corners.length);
  });

  it('floats each vertical layer one row up so its SAVE blocks sit in the gap below', () => {
    const plan = splitPlan([8, 96, 8] as Vec3, LIMIT); // 1×2×1 = 2 stacked pieces (y split 48|48)
    const layout = scaffoldLayout(plan);
    const lower = layout.find((l) => l.slot.j === 0)!;
    const upper = layout.find((l) => l.slot.j === 1)!;
    // Lower piece geometry lands at y=1 (its SAVE block at y=0); the upper layer gains an extra
    // empty row, so its SAVE block (anchor.y) clears the top of the lower piece.
    expect(lower.anchor[1]).toBe(0);
    expect(upper.anchor[1]).toBe(upper.slot.min[1] + 1);
    expect(upper.anchor[1]).toBeGreaterThan(lower.anchor[1] + lower.slot.size[1]);
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
      expect(line).toMatch(/posY:1/); // box sits above the structure block
      expect(line).toMatch(/showboundingbox:1b/);
    }
    // Usage header is present (comment lines).
    expect(text).toMatch(/^# Blockwright in-world editing scaffold/m);
  });
});
