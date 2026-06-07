// "kitchen" — a working kitchen: a run of counters (stairs/slabs over barrels and
// blast furnaces/smokers as a cooktop and oven), a sink, overhead shelving, a pantry
// of barrels/composters, and a dining nook (table + stair chairs). Guidance-only; the
// AI furnishes it from the knowledge guide.
import type { RoomModule } from './types';

export const kitchen: RoomModule = {
  id: 'kitchen',
  label: 'Kitchen',
  category: 'room',
  description:
    'A working kitchen: a counter run (slabs/stairs over barrels with a smoker/blast-furnace ' +
    'cooktop and a cauldron sink), overhead and base storage of barrels and composters, a ' +
    'pantry, and a small dining nook. Functional, lit, and tidy.',
  knowledge: 'nbt/modules/room/kitchen.md',
  appliesTo: ['house'],
  presets: [
    {
      id: 'kitchen-snug',
      label: 'Kitchenette',
      scale: 'snug',
      summary: 'A short counter run with a cooktop, sink and a little storage.',
      furnishings: [
        'a short L of counters (slabs/stairs over barrels) along one corner',
        'a smoker or blast furnace set in as a cooktop, plus a cauldron sink',
        'a couple of overhead shelves and a barrel or two for storage',
        'a single working lantern',
      ],
    },
    {
      id: 'kitchen-standard',
      label: 'Kitchen',
      scale: 'standard',
      summary: 'A full counter run, a pantry, overhead storage and a small dining nook.',
      furnishings: [
        'a counter run along a wall — cooktop (smoker/blast furnace), prep space, cauldron sink',
        'overhead shelving and base storage of barrels and composters',
        'a pantry corner (stacked barrels + a chest)',
        'a small dining nook — a table with two stair chairs',
        'hanging tools/pots and warm task lighting',
      ],
    },
    {
      id: 'kitchen-grand',
      label: 'Farmhouse kitchen',
      scale: 'grand',
      summary:
        'A big working kitchen with a central island and a full dining table — counters ' +
        'on two walls, a walk-in pantry, no empty floor.',
      furnishings: [
        'counters on two walls — a cooking range (multiple smokers/furnaces), a long prep run, a double sink',
        'a central island or butcher block with stool seating and hanging pots above',
        'a full dining table with chairs for the household, on a rug',
        'a walk-in pantry / larder zone of floor-to-ceiling barrels, chests and composters',
        'a dresser/hutch displaying crockery, plus overhead shelving along the runs',
        'hanging lanterns over the island and the table, herbs/tools on the walls',
      ],
    },
  ],
};
