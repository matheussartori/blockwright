// "Abandoned" — the default, ruined look: no material overrides (it rides each
// type's own kit), a moderate decay level set per type, and stone→mossy weathering
// for the decay patches. This reproduces the behaviour the old templates had baked
// in, so porting a preset to (type + abandoned) leaves its output unchanged.
import { bareId } from '../structure-types/types';
import type { DecorationTheme } from './types';

export const abandoned: DecorationTheme = {
  id: 'abandoned',
  label: 'Abandoned',
  blocks: {},
  // decay is left to the type's own default (houses 0.2, cellars 0.25).
  weather(blockId: string): string {
    switch (bareId(blockId)) {
      case 'cobblestone': return 'minecraft:mossy_cobblestone';
      case 'stone_bricks': return 'minecraft:mossy_stone_bricks';
      case 'stone_brick_wall': return 'minecraft:mossy_stone_brick_wall';
      case 'cobblestone_wall': return 'minecraft:mossy_cobblestone_wall';
      default: return blockId;
    }
  },
};
