// "ritual" — a cult's summoning chamber: a binding circle scribed into the floor, a
// candle-ringed stone altar laid for sacrifice, braziers and dripping wax, shelves of
// reagents in jars. The room reads as a place where something was CALLED. Guidance-only;
// the AI furnishes it from the knowledge guide, re-skinned by the active decoration.
import { defineRoom } from './define';

export const ritual = defineRoom({
  id: 'ritual',
  label: 'Ritual Chamber',
  group: 'horror',
  description:
    'A cult summoning chamber: a binding circle scribed into the floor inside a ring of ' +
    'guttering candles, a stone sacrificial altar, corner braziers, and shelves of reagents ' +
    'in jars. Dim, smoky, and reverent in the worst way — the room where the rite is performed.',
  presets: [
    {
      scale: 'snug',
      label: 'Hidden shrine',
      summary: 'A small altar with candles, a scribed sigil on the floor, a reagent shelf.',
      furnishings: [
        'a low stone altar against the back wall, draped in cloth, with candles and a skull on top',
        'a small sigil scribed into the floor in front of it (a carpet/concrete inlay) ringed by candles',
        'a shelf of reagents — bottles, a brewing stand, a hanging dried herb',
        'a single dim, cold light source so the candle flames carry the mood',
      ],
    },
    {
      scale: 'standard',
      label: 'Ritual chamber',
      summary: 'A central binding circle ringed with candles, a sacrificial altar, corner braziers.',
      furnishings: [
        'a central BINDING CIRCLE inlaid into the floor (a ring of contrasting blocks with a sigil at its heart), edged with candles',
        'a raised stone altar at the head of the circle — cloth-draped, laid with candelabra, a chained book or relic, and the means of sacrifice',
        'a brazier (fire in a cauldron/iron basin) in each corner casting low light',
        'a wall of reagent shelves — jars, brewing stands, hanging bundles, a few caged specimens',
        'wax-run candle clusters and chains on the walls; keep the room smoky and underlit',
      ],
    },
    {
      scale: 'grand',
      label: 'Cult sanctum',
      summary:
        'A pillared hall with a great pentagram, a tiered altar dais, pews for the faithful, ' +
        'hanging cages and braziers.',
      furnishings: [
        'a GREAT SIGIL filling the floor — a multi-ring pentagram/circle of inlaid blocks with candle pillars at every node',
        'a raised, stepped ALTAR DAIS at the head of the hall: a grand cloth-draped altar with a towering candelabrum, a chained idol or relic above it',
        'rows of PEWS or kneeling benches facing the dais, split by a central processional aisle',
        'flanking pillars hung with chains, banners, and iron sconces; ritual braziers down both sides',
        'iron hanging cages and a sacrificial slab off to one side; wall niches of skulls and reagent jars',
        'cold, sparse overhead light so the massed candle flames and brazier fire dominate — gloom with islands of glow',
      ],
    },
  ],
});
