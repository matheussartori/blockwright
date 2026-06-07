// "living" — a living room / sitting room: the social heart of the home. A hearth or
// fireplace wall, seating clustered around it (stair "sofas", a carpet rug), a low
// table, shelves and pictures, soft lighting. Guidance-only; the AI furnishes it from
// the knowledge guide.
import { defineRoom } from './define';

export const living = defineRoom({
  id: 'living',
  label: 'Living room',
  description:
    'A social sitting room built around a hearth: a fireplace or chimney wall, a seating ' +
    'cluster of stair "sofas" on a wool rug, a low table, shelves and wall pictures, and warm ' +
    'ambient light. The welcoming centre of the home.',
  presets: [
    {
      scale: 'snug',
      label: 'Sitting nook',
      summary: 'A small sitting corner: a couple of seats facing a single focal point.',
      furnishings: [
        'a single focal point — a small hearth or a window — on one wall',
        'two stair "chairs" or a short couch facing it, on a small rug',
        'a low side table with a candle or potted plant',
        'a painting or a pair of wall sconces',
      ],
    },
    {
      scale: 'standard',
      label: 'Living room',
      summary: 'A hearth, a seating cluster on a rug, a coffee table and shelving.',
      furnishings: [
        'a fireplace or feature wall as the focal point',
        'a seating cluster facing it — a 2–3 seat couch plus an armchair on a rug',
        'a coffee table in the middle with a lantern or flower pot',
        'bookshelves and wall paintings dressing the walls',
        'a potted plant in a corner and warm ambient light',
      ],
    },
    {
      scale: 'grand',
      label: 'Great room',
      summary:
        'A two-zone great room: a fireplace lounge plus a second cluster (reading or ' +
        'games), columns and rugs dividing a large floor.',
      furnishings: [
        'a grand fireplace wall with a tall mantel as the main focal point',
        'a generous lounge facing it — a large couch, two armchairs, a coffee table, a big rug',
        'a SECOND zone across the room — a reading corner, a games/dining table, or a piano nook',
        'columns, a rug runner, or a half-height divider separating the two zones',
        'a long shelving / display wall and several large wall paintings',
        'potted plants, a chandelier of hanging lanterns, and wall sconces throughout',
      ],
    },
  ],
});
