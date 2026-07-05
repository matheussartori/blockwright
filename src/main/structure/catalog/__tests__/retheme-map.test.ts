import { describe, expect, it } from 'vitest';
import { rethemeMap } from '../retheme-map';

// No mod workspace is active under vitest, so role classification runs on the id
// heuristic (`guessRole`) alone — the vanilla-build path the Re-theme dialog uses.
describe('rethemeMap', () => {
  it('maps role-classified blocks to the decoration, leaving the rest alone', () => {
    const map = rethemeMap(
      [
        'minecraft:oak_planks', // wall  → dark_oak_planks
        'minecraft:oak_stairs', // roof  → dark_oak_stairs
        'minecraft:glass_pane', // window → gray_stained_glass_pane
        'minecraft:chest', // no role → untouched
      ],
      'haunted',
    );
    expect(map).toEqual({
      'minecraft:oak_planks': 'minecraft:dark_oak_planks',
      'minecraft:oak_stairs': 'minecraft:dark_oak_stairs',
      'minecraft:glass_pane': 'minecraft:gray_stained_glass_pane',
    });
  });

  it('omits a block the decoration already uses (no self-swap noise)', () => {
    const map = rethemeMap(['minecraft:dark_oak_planks'], 'haunted');
    expect(map).toEqual({});
  });

  it('never claims the solid wall role for a connecting *_wall post', () => {
    // The guessRole `_wall` guard is load-bearing: a cobblestone_wall POST re-themed
    // into the decoration's solid wall material would fill the build with full cubes.
    const map = rethemeMap(['minecraft:cobblestone_wall'], 'haunted');
    expect(map).toEqual({});
  });

  it('returns an empty map for an unknown decoration', () => {
    expect(rethemeMap(['minecraft:oak_planks'], 'no-such-decoration')).toEqual({});
  });
});
