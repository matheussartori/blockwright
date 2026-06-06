// "living" — a living room / sitting room: the social heart of the home. A hearth or
// fireplace wall, seating clustered around it (stair "sofas", a carpet rug), a low
// table, shelves and pictures, soft lighting. Guidance-only; the AI furnishes it from
// the knowledge guide.
import type { RoomModule } from './types';

export const living: RoomModule = {
  id: 'living',
  label: 'Living room',
  category: 'room',
  description:
    'A social sitting room built around a hearth: a fireplace or chimney wall, a seating ' +
    'cluster of stair "sofas" on a wool rug, a low table, shelves and wall pictures, and warm ' +
    'ambient light. The welcoming centre of the home.',
  knowledge: 'nbt/modules/room/living.md',
  appliesTo: ['house'],
};
