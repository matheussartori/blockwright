// "seance" — a Victorian séance parlour / occult study: a round table set for contacting
// the dead under a low candelabrum, heavy drapes, cabinets of curiosities, a crystal-gazing
// nook, taxidermy and grimoires. Genteel on the surface, deeply uncanny underneath.
// Guidance-only; the AI furnishes it from the knowledge guide, re-skinned by the decoration.
import { defineRoom } from './define';

export const seance = defineRoom({
  id: 'seance',
  label: 'Séance Parlour',
  group: 'horror',
  description:
    'A Victorian séance parlour and occult study: a round table set for contacting the dead ' +
    'under a low candelabrum, heavy drapes, cabinets of curiosities, a crystal-gazing nook, ' +
    'taxidermy, and shelves of grimoires. Genteel on the surface, deeply uncanny underneath.',
  presets: [
    {
      scale: 'snug',
      label: 'Reading nook',
      summary: 'A small round table with two chairs, centre candles, drawn curtains, a curio shelf.',
      furnishings: [
        'a small ROUND TABLE with two facing chairs and a cluster of candles at its centre',
        'a divining object on the table — a crystal-gazing piece (an end rod / glass) or a spirit board inlay',
        'heavy curtains drawn over the window and a small rug underfoot',
        'one shelf of curiosities — a skull, jars, a grimoire — and low, warm-but-eerie candlelight',
      ],
    },
    {
      scale: 'standard',
      label: 'Séance room',
      summary: 'A central round table ringed with chairs, a hanging candelabrum, curio cabinets, a fireplace.',
      furnishings: [
        'a CENTRAL ROUND TABLE ringed with chairs, candles at its heart and a spirit board / crystal centrepiece',
        'a low HANGING CANDELABRUM directly over the table (lanterns/candles on a chain frame)',
        'CABINETS OF CURIOSITIES against the walls — glass cases of jars, bones, relics and oddities',
        'a fireplace with a wing chair, a large rug, and heavy floor-length drapes over the windows',
        'a shelf of grimoires, a mounted taxidermy piece, wall sconces dimmed for the sitting',
      ],
    },
    {
      scale: 'grand',
      label: 'Occult parlour',
      summary:
        'A grand séance table under a great candelabrum, walls of curio cabinets and grimoires, ' +
        'a crystal-gazing alcove, a fireplace lounge, mirrors and drapes.',
      furnishings: [
        'a GRAND ROUND TABLE at the centre, many chairs around it, an elaborate centrepiece (spirit board, crystal, candle ring)',
        'a great hanging CANDELABRUM/chandelier of candles above it, casting a single pool of light',
        'walls of CABINETS — glass cases of specimens and relics, plus floor-to-ceiling grimoire shelves with a ladder',
        'a CRYSTAL-GAZING ALCOVE: a draped side table with a glowing orb, cushions, and a fortune-teller’s chair',
        'a fireplace LOUNGE — wing chairs, a chaise, a large patterned rug — set apart for receiving guests',
        'tall draped mirrors, mounted taxidermy and portraits whose eyes seem to follow; heavy curtains and dimmed sconces throughout',
      ],
    },
  ],
});
