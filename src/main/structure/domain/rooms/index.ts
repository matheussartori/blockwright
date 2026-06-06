// Room registry (category "room"). Each interior program is one module file
// (living, kitchen, library, bedroom, dormitory, storage). Rooms are GUIDANCE-ONLY:
// no `build()` geometry is wired into the compiler — a selected room rides into
// generation as a plain-language "[Room plan]" line per floor + its own knowledge
// guide (loaded ONLY when selected, so an unused room guide never bloats the prompt),
// and is documented in the gallery. Each links to the structures it fits via
// `appliesTo`. Add a room: new file here + register below + a knowledge guide under
// `knowledge/nbt/modules/room/<id>.md`.
import { toSummary, type ModuleSummary } from '../modules';
import { bedroom } from './bedroom';
import { dormitory } from './dormitory';
import { kitchen } from './kitchen';
import { library } from './library';
import { living } from './living';
import { storage } from './storage';
import type { RoomModule } from './types';

export type { RoomModule } from './types';

const ROOMS: Record<string, RoomModule> = {
  [living.id]: living,
  [kitchen.id]: kitchen,
  [library.id]: library,
  [bedroom.id]: bedroom,
  [dormitory.id]: dormitory,
  [storage.id]: storage,
};

/** Look up a room module by id (undefined if unknown). */
export function getRoom(id: string): RoomModule | undefined {
  return ROOMS[id];
}

/** Every room module, as a module summary (for the composer + gallery). */
export function listRooms(): ModuleSummary[] {
  return Object.values(ROOMS).map(toSummary);
}

/** Every room module (for the knowledge loader). */
export function roomModules(): RoomModule[] {
  return Object.values(ROOMS);
}
