// "bedroom" — a single private bedroom: one made bed against a wall, a nightstand
// with a lantern/candle, a wardrobe (barrels/shelves), a small rug, a window with
// curtains, and maybe a desk. Guidance-only; the AI furnishes it from the guide.
// Its furnishing PRESETS scale the layout to the floor (snug → grand) so a big
// bedroom isn't left echoing-empty.
import { defineRoom } from './define';

export const bedroom = defineRoom({
  id: 'bedroom',
  label: 'Bedroom',
  description:
    'A single private bedroom: a made bed against a wall with a headboard, a nightstand and ' +
    'lantern, a wardrobe and chest, a small rug, a curtained window, and an optional writing ' +
    'desk. Cozy and personal.',
  presets: [
    {
      scale: 'snug',
      label: 'Cot corner',
      summary: 'A single bed tucked in a corner with the essentials — nothing more.',
      furnishings: [
        'one bed in a corner against the wall, with a simple headboard above',
        'a single nightstand beside it with a lantern or candle',
        'a small chest or stacked barrels for clothes',
        'a curtained window',
      ],
    },
    {
      scale: 'standard',
      label: 'Bedroom',
      summary: 'A balanced bedroom: bed, matching nightstands, a wardrobe, a rug and a window.',
      furnishings: [
        'a made bed against the centre of a wall with a headboard',
        'a matching nightstand and lamp on each side of the bed',
        'a wardrobe / dresser run against another wall (barrels + a chest + framed doors)',
        'a rug beside the bed defining the sleeping zone',
        'a curtained window',
        'a small writing desk with a lectern or candle',
      ],
    },
    {
      scale: 'grand',
      label: 'Master suite',
      summary:
        'A large suite split into zones: a four-poster bed feature wall, a wardrobe run, ' +
        'and a separate sitting/dressing nook so the floor never reads empty.',
      furnishings: [
        'a four-poster / canopy bed centred on a feature wall, framed by tall posts',
        'a nightstand with a lamp on each side and wall art above the headboard',
        'a long wardrobe run plus a dresser along one wall',
        'a large rug anchoring the bed zone',
        'a separate sitting nook by the window — two chairs and a small table, or a reading corner',
        'a writing desk / vanity in its own corner',
        'pillars, a rug runner, or a low divider to break the open floor into zones',
        'wall paintings, potted plants in the corners, and hanging lanterns for soft light',
      ],
    },
  ],
});
