// "storage" — a storeroom / pantry: walls of stacked barrels and chests, labelled
// shelves, sacks (composters/cauldrons), crates (barrels), hanging tools, and a
// single working lantern. A utilitarian back room. Guidance-only; the AI furnishes it
// from the knowledge guide.
import type { RoomModule } from './types';

export const storage: RoomModule = {
  id: 'storage',
  label: 'Storage room',
  category: 'room',
  description:
    'A utilitarian storeroom: walls of stacked barrels and chests, shelving, sacks and crates, ' +
    'hanging tools, and a single working lantern. The pantry / back room where the household keeps ' +
    'its supplies.',
  knowledge: 'nbt/modules/room/storage.md',
  appliesTo: ['house'],
};
