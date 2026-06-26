import { describe, it, expect } from 'vitest';
import { splitPlan, type Vec3 } from '../split';
import { scaffoldFunction, scaffoldLayout } from '../scaffold';

const LIMIT = 48;

describe('scaffoldLayout', () => {
  it('gives every piece a non-overlapping anchor on a compact grid', () => {
    const plan = splitPlan([120, 40, 120] as Vec3, LIMIT); // 3×1×3 = 9 pieces
    const layout = scaffoldLayout(plan);
    expect(layout).toHaveLength(plan.slots.length);

    // No two editing boxes share an X/Z column closer than the limit (boxes can't touch).
    const step = LIMIT + 2;
    const anchors = layout.map((l) => l.anchor);
    for (let a = 0; a < anchors.length; a++)
      for (let b = a + 1; b < anchors.length; b++) {
        const sameCell = anchors[a][0] === anchors[b][0] && anchors[a][2] === anchors[b][2];
        expect(sameCell).toBe(false);
      }
    // Anchors are multiples of the grid step.
    for (const [x, , z] of anchors) {
      expect(x % step).toBe(0);
      expect(z % step).toBe(0);
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
      expect(line).toMatch(/posY:1/); // box sits above the structure block
      expect(line).toMatch(/showboundingbox:1b/);
    }
    // Usage header is present (comment lines).
    expect(text).toMatch(/^# Blockwright in-world editing scaffold/m);
  });
});
