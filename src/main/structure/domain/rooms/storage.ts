// "storage" — a storeroom / pantry: walls of stacked barrels and chests, labelled
// shelves, sacks (composters/cauldrons), crates (barrels), hanging tools, and a
// single working lantern. A utilitarian back room. Guidance-only; the AI furnishes it
// from the knowledge guide.
import { defineRoom } from './define';

export const storage = defineRoom({
  id: 'storage',
  label: 'Storage room',
  description:
    'A utilitarian storeroom: walls of stacked barrels and chests, shelving, sacks and crates, ' +
    'hanging tools, and a single working lantern. The pantry / back room where the household keeps ' +
    'its supplies.',
  presets: [
    {
      scale: 'snug',
      label: 'Pantry closet',
      summary: 'A small closet of shelves and barrels.',
      furnishings: [
        'shelving and stacked barrels along one or two walls',
        'a couple of chests and a sack (composter) on the floor',
        'a single lantern',
      ],
    },
    {
      scale: 'standard',
      label: 'Storeroom',
      summary: 'Walls of barrels and chests, labelled shelving, sacks and crates.',
      furnishings: [
        'walls of stacked barrels and chests',
        'labelled shelving with item frames',
        'sacks and crates (composters, barrels) on the floor',
        'hanging tools and a working lantern',
      ],
    },
    {
      scale: 'grand',
      label: 'Warehouse',
      summary:
        'A stockroom with shelving rows / aisles, a central worktable, and crates stacked ' +
        'high — a big room kept busy, not empty.',
      furnishings: [
        'free-standing shelving rows forming aisles down the floor',
        'walls lined floor-to-ceiling with barrels and labelled chests',
        'a central worktable / sorting bench with crates around it',
        'stacked crates and sacks (barrels, composters) filling the corners',
        'hanging tools and a ladder to high shelves',
        'lanterns down each aisle for even light',
      ],
    },
  ],
});
