// "dungeon" — a torture dungeon / holding block: barred cells with straw and chains, a
// central rack and the torturer's tools, hanging cages, a grated drain in the floor. The
// room reads as a place of confinement and cruelty. Guidance-only; the AI furnishes it
// from the knowledge guide, re-skinned by the active decoration. Pairs well below grade.
import { defineRoom } from './define';

export const dungeon = defineRoom({
  id: 'dungeon',
  label: 'Dungeon',
  group: 'horror',
  description:
    'A torture dungeon and holding block: iron-barred cells with straw and wall chains, a ' +
    'central rack and a bench of cruel tools, hanging cages, and a grated drain in the floor. ' +
    'Damp, cold, and lit only by guttering torches — confinement and cruelty in stone.',
  presets: [
    {
      scale: 'snug',
      label: 'Holding cell',
      summary: 'A single barred cell with straw and chains, a barred door, a low torch.',
      furnishings: [
        'one small cell walled off with iron bars and a barred door',
        'straw/hay on the cell floor, a wooden bucket, and shackles chained to the wall',
        'a guard stool and a small tool peg outside the bars',
        'a single low, cold torch — keep the corners dark',
      ],
    },
    {
      scale: 'standard',
      label: 'Torture chamber',
      summary: 'A pair of barred cells, a central rack, a tool bench, a floor drain.',
      furnishings: [
        'two barred CELLS along one wall, each with straw, wall shackles, and a barred door',
        'a central RACK or torture table — a frame with chains at both ends, stained and grim',
        "a torturer's bench of tools (an anvil, a grindstone, hung implements, a brazier of coals)",
        'a grated DRAIN set into the floor at the room’s low point',
        'wall chains, a hanging iron cage, and sparse guttering torches for cold, uneven light',
      ],
    },
    {
      scale: 'grand',
      label: 'Dungeon block',
      summary:
        'A corridor of cells, multiple instruments of torture, a hanging cage, a central ' +
        'drain pit, the torturer’s station.',
      furnishings: [
        'a CORRIDOR lined with barred cells down both sides, each with a barred door, straw, and wall shackles',
        'a row of TORTURE INSTRUMENTS in the open central space — a rack, a stocks/pillory, a wheel, a suspended iron cage',
        "the torturer's STATION: a heavy tool bench, an anvil and grindstone, a coal brazier, weapons and chains on a peg wall",
        'a central DRAIN PIT or grated channel running the length of the floor',
        'a few barrels, a water cauldron, and scattered bones in the cells',
        'iron sconces and guttering torches set far apart so most of the block stays in shadow',
      ],
    },
  ],
});
