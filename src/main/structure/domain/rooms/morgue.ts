// "morgue" — a mortuary / embalming room: sheeted bodies on cold slabs, a wall of cadaver
// drawers, an embalming table laid with bottles and instruments, coffins and specimen jars.
// Clinical, cold, and quietly horrible. Guidance-only; the AI furnishes it from the
// knowledge guide, re-skinned by the active decoration.
import { defineRoom } from './define';

export const morgue = defineRoom({
  id: 'morgue',
  label: 'Morgue',
  group: 'horror',
  description:
    'A mortuary and embalming room: sheeted bodies on cold slabs, a wall of cadaver drawers, ' +
    'an embalming table laid with bottles and instruments, coffins, and specimen jars. ' +
    'Clinical, cold, and quietly horrible — where the dead are kept and prepared.',
  presets: [
    {
      scale: 'snug',
      label: 'Embalming nook',
      summary: 'One slab with a sheeted body, a jar shelf, an upright coffin, a dim lamp.',
      furnishings: [
        'a single cold SLAB (a stone/quartz table) with a sheeted body on it',
        'a small instrument tray and a shelf of bottles and jars beside it',
        'an empty coffin stood upright against the wall',
        'a wash basin/cauldron and one dim, sterile light',
      ],
    },
    {
      scale: 'standard',
      label: 'Morgue',
      summary: 'A row of sheeted slabs, an embalming table, wall drawers, an open coffin.',
      furnishings: [
        'a ROW of cold slabs down the room, sheeted bodies on a couple of them',
        'an EMBALMING TABLE with bottles, an instrument tray, a brewing stand, and a wash basin',
        'a wall of CADAVER DRAWERS (a grid of fronted compartments with handles)',
        'an open coffin on trestles and a stack of spare lids',
        'cold overhead lighting (lanterns behind frosted/iron grilles), a grated floor drain',
      ],
    },
    {
      scale: 'grand',
      label: 'Mortuary hall',
      summary:
        'A wall of body drawers, multiple autopsy slabs, a central embalming station, ' +
        'stacked coffins, glass cabinets of specimens.',
      furnishings: [
        'a full WALL OF DRAWERS — a tall grid of cadaver compartments, a couple left ajar',
        'several AUTOPSY SLABS arranged in a grid, with sheeted bodies, hung lamps, and a drain beneath each',
        'a central EMBALMING STATION: a long table of bottles, fluids, instrument trays, brewing stands, and basins',
        'a coffin area — coffins on trestles and stacked spares, a few lids leaned aside',
        'glass display CABINETS of specimen jars (organs/oddities) and shelves of labelled bottles',
        'a registrar’s desk with a ledger and candle; cold, even, sterile light with a grated central channel',
      ],
    },
  ],
});
