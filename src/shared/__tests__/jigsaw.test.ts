import { describe, expect, it } from 'vitest';
import type { JigsawConnector } from '../types';
import {
  aabbOverlap,
  isHorizontal,
  makeRng,
  oppositeDir,
  parseOrientation,
  pickIndex,
  pickWeighted,
  pieceAabb,
  rootPlacement,
  rotateDirY,
  rotatePointY,
  solveAttachment,
  worldCenter,
  worldFront,
} from '../jigsaw';

/** A horizontal jigsaw connector at `pos` facing `front` (top "up"). */
function connector(pos: [number, number, number], front: string, over: Partial<JigsawConnector> = {}): JigsawConnector {
  return {
    pos, name: 'n', target: 't', pool: 'p', finalState: 'minecraft:air',
    joint: 'aligned', orientation: `${front}_up`, selectionPriority: 0, placementPriority: 0,
    ...over,
  };
}

describe('rotatePointY', () => {
  it('matches the Three.js +Y convention for each quarter-turn', () => {
    expect(rotatePointY([1, 5, 2], 0)).toEqual([1, 5, 2]);
    expect(rotatePointY([1, 5, 2], 1)).toEqual([2, 5, -1]);
    expect(rotatePointY([1, 5, 2], 2)).toEqual([-1, 5, -2]);
    expect(rotatePointY([1, 5, 2], 3)).toEqual([-2, 5, 1]);
  });
  it('leaves the Y axis untouched', () => {
    expect(rotatePointY([3, 9, 2], 1)[1]).toBe(9);
  });
});

describe('direction helpers', () => {
  it('rotates a direction about +Y', () => {
    expect(rotateDirY('south', 1)).toBe('east');
    expect(rotateDirY('south', 2)).toBe('north');
    expect(rotateDirY('south', 3)).toBe('west');
  });
  it('knows opposites and horizontality', () => {
    expect(oppositeDir('north')).toBe('south');
    expect(oppositeDir('up')).toBe('down');
    expect(isHorizontal('east')).toBe(true);
    expect(isHorizontal('up')).toBe(false);
  });
  it('parses an orientation string', () => {
    expect(parseOrientation('south_up')).toEqual({ front: 'south', top: 'up' });
  });
});

describe('worldCenter / worldFront', () => {
  it('returns the block center at the identity placement', () => {
    expect(worldCenter([0, 0, 0], rootPlacement())).toEqual([0.5, 0.5, 0.5]);
  });
  it('rotates the connector front by the placement turns', () => {
    expect(worldFront(connector([0, 0, 0], 'south'), { offset: [0, 0, 0], quarterTurns: 1 })).toBe('east');
  });
});

describe('solveAttachment', () => {
  it('places a child so it faces back at a horizontal source connector', () => {
    const source = connector([0, 0, 0], 'south'); // faces +z
    const child = connector([0, 0, 0], 'north'); // already faces -z → no rotation needed
    const placement = solveAttachment(source, rootPlacement(), child);
    expect(placement).not.toBeNull();
    // The child's connector front now opposes the source's world front.
    expect(worldFront(child, placement!)).toBe(oppositeDir('south'));
  });

  it('rotates a child whose front does not already oppose the source', () => {
    const source = connector([0, 0, 0], 'south');
    const child = connector([0, 0, 0], 'south'); // must rotate 180° to face -z
    const placement = solveAttachment(source, rootPlacement(), child);
    expect(placement).not.toBeNull();
    expect(placement!.quarterTurns).toBe(2);
  });

  it('returns null when a vertical front cannot reach a horizontal target', () => {
    const source = connector([0, 0, 0], 'south');
    const child = connector([0, 0, 0], 'up'); // vertical front can't rotate to horizontal
    expect(solveAttachment(source, rootPlacement(), child)).toBeNull();
  });
});

describe('AABB overlap', () => {
  it('computes a world-space box under the identity placement', () => {
    expect(pieceAabb([2, 3, 4], rootPlacement())).toEqual({ min: [0, 0, 0], max: [2, 3, 4] });
  });
  it('treats face-touching boxes as non-overlapping', () => {
    const a = pieceAabb([2, 2, 2], { offset: [0, 0, 0], quarterTurns: 0 });
    const b = pieceAabb([2, 2, 2], { offset: [2, 0, 0], quarterTurns: 0 });
    expect(aabbOverlap(a, b)).toBe(false);
  });
  it('detects an interpenetrating box', () => {
    const a = pieceAabb([2, 2, 2], { offset: [0, 0, 0], quarterTurns: 0 });
    const b = pieceAabb([2, 2, 2], { offset: [1, 0, 0], quarterTurns: 0 });
    expect(aabbOverlap(a, b)).toBe(true);
  });
});

describe('seeded RNG', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('diverges for different seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
  it('pickIndex stays in range and pickWeighted honors zero weights', () => {
    expect(pickIndex(0.99, 4)).toBe(3);
    expect(pickIndex(0, 4)).toBe(0);
    // All weight on the last bucket → always picks it.
    expect(pickWeighted(0.5, [0, 0, 1])).toBe(2);
  });
});
