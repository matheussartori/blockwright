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
  appliesTo: ['house'],
  presets: [
    {
      id: 'library-snug',
      label: 'Reading nook',
      scale: 'snug',
      summary: 'One bookshelf wall, a reading chair by a window, a lectern.',
      furnishings: [
        'one wall lined with bookshelves',
        'a single reading chair (stairs) with a small side table by a window',
        'a lectern with a candle',
        'a soft lantern overhead',
      ],
    },
    {
      id: 'library-standard',
      label: 'Library',
      scale: 'standard',
      summary: 'Bookshelf walls, a central study table with lecterns, a reading chair.',
      furnishings: [
        'two or three walls lined floor-to-ceiling with bookshelves (broken by a glassed cabinet)',
        'a central study table with lecterns and candles',
        'a reading chair and side table by a window',
        'a rug under the table and a chandelier above',
      ],
    },
    {
      id: 'library-grand',
      label: 'Great library',
      scale: 'grand',
      summary:
        'A two-storey-feel hall: full bookshelf walls with a gallery/ladder, reading ' +
        'tables, and a fireplace study corner.',
      furnishings: [
        'every wall floor-to-ceiling in bookshelves, with a ladder or stair to the upper shelves (or a gallery walkway)',
        'free-standing bookshelf stacks dividing the floor into aisles',
        'two or more reading tables with lecterns, plus a long central table',
        'a fireplace study corner with armchairs and a rug',
        'glassed display cabinets for special tomes, globes/maps on stands',
        'a grand chandelier and wall sconces lighting the whole hall',
      ],
    },
  ],
};
