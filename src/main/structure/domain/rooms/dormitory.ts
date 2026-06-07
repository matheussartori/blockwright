// "dormitory" — a shared sleeping room with several beds: a row (or two facing rows)
// of beds split by low partitions or rugs, a shared nightstand/lantern per bed, a
// common wardrobe wall, and windows down the long side. Use for a children's room, an
// inn floor, or barracks. Guidance-only; the AI furnishes it from the guide. Its
// PRESETS scale the bed count + zoning to the floor (the big empty shared bedroom that
// prompted this is a "grand" dormitory).
import { defineRoom } from './define';

export const dormitory = defineRoom({
  id: 'dormitory',
  label: 'Bedrooms (shared)',
  description:
    'A shared sleeping room with several beds: a row or two facing rows of beds, each with its ' +
    'own nightstand and lantern, divided by low partitions or rugs, a common wardrobe wall, and ' +
    'windows down the long side. An inn floor, barracks, or kids’ room.',
  presets: [
    {
      scale: 'snug',
      label: 'Twin room',
      summary: 'Two beds sharing a nightstand — a small shared room.',
      furnishings: [
        'two beds along one wall with a shared nightstand and lantern between them',
        'a single common wardrobe (stacked barrels + a chest)',
        'a window between or above the beds',
      ],
    },
    {
      scale: 'standard',
      label: 'Bunk row',
      summary: 'A row of three or four beds, each with its own nightstand, down one wall.',
      furnishings: [
        'a row of 3–4 beds along the long wall, each with a nightstand and lantern',
        'low partitions or rugs separating the bunks',
        'a common wardrobe wall (barrels, chests, framed doors)',
        'windows down the long side above the beds',
      ],
    },
    {
      scale: 'grand',
      label: 'Dormitory hall',
      summary:
        'Two facing rows of beds down a central aisle, zoned with partitions — fills a ' +
        'large hall instead of leaving it empty.',
      furnishings: [
        'two facing rows of beds (6 or more) down the long walls',
        'a central aisle with a carpet runner and hanging lanterns overhead',
        'a partition (wall, fence, or shelving) between each pair of beds for privacy',
        'a nightstand and a small chest or trunk at the foot of every bed',
        'a shared wardrobe + washing nook at one end (cauldron, barrels, a bench)',
        'windows down both long walls between the beds',
        'a central feature — a stove/brazier or a pillar — to anchor the middle of the floor',
      ],
    },
  ],
});
