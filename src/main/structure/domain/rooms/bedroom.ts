// "bedroom" — a single private bedroom: one made bed against a wall, a nightstand
// with a lantern/candle, a wardrobe (barrels/shelves), a small rug, a window with
// curtains, and maybe a desk. Guidance-only; the AI furnishes it from the guide.
import type { RoomModule } from './types';

export const bedroom: RoomModule = {
  id: 'bedroom',
  label: 'Bedroom',
  category: 'room',
  description:
    'A single private bedroom: a made bed against a wall with a headboard, a nightstand and ' +
    'lantern, a wardrobe and chest, a small rug, a curtained window, and an optional writing ' +
    'desk. Cozy and personal.',
  knowledge: 'nbt/modules/room/bedroom.md',
  appliesTo: ['house'],
};
