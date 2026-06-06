// "dormitory" — a shared sleeping room with several beds: a row (or two facing rows)
// of beds split by low partitions or rugs, a shared nightstand/lantern per bed, a
// common wardrobe wall, and windows down the long side. Use for a children's room, an
// inn floor, or barracks. Guidance-only; the AI furnishes it from the guide.
import type { RoomModule } from './types';

export const dormitory: RoomModule = {
  id: 'dormitory',
  label: 'Bedrooms (shared)',
  category: 'room',
  description:
    'A shared sleeping room with several beds: a row or two facing rows of beds, each with its ' +
    'own nightstand and lantern, divided by low partitions or rugs, a common wardrobe wall, and ' +
    'windows down the long side. An inn floor, barracks, or kids’ room.',
  knowledge: 'nbt/modules/room/dormitory.md',
  appliesTo: ['house'],
};
