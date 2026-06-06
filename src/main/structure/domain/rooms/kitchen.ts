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
  appliesTo: ['house', 'tower'],
};
