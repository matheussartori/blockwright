// "library" — a reading room: walls lined floor-to-ceiling with bookshelves, a
// central reading table with lecterns and candles, a comfortable reading chair by a
// window, ladders or stairs to upper shelves, and a chandelier. Guidance-only; the AI
// furnishes it from the knowledge guide.
import type { RoomModule } from './types';

export const library: RoomModule = {
  id: 'library',
  label: 'Library',
  category: 'room',
  description:
    'A quiet reading room: walls lined floor-to-ceiling with bookshelves (broken by the odd ' +
    'glassed cabinet), a central study table with lecterns and candles, a reading chair by a ' +
    'window, and a chandelier. Studious and warm.',
  knowledge: 'nbt/modules/room/library.md',
  appliesTo: ['house', 'tower'],
};
