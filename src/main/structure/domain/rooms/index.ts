// Room registry (category "room"). Each interior program is one module file
// (living, kitchen, library, bedroom, dormitory, storage). Rooms are GUIDANCE-ONLY:
// no `build()` geometry is wired into the compiler — a selected room rides into
// generation as a plain-language "[Room plan]" line per floor + its own knowledge
// guide (loaded ONLY when selected, so an unused room guide never bloats the prompt),
// and is documented in the gallery. Each links to the structures it fits via
// `appliesTo`. Author a room with `defineRoom` (define.ts) so the category/guide-path/
// preset-ids are filled in for you. Add a room: new file (a `defineRoom({...})` export)
// here + register below + a knowledge guide under `knowledge/nbt/modules/room/<id>.md`.
import type { ModuleSummary } from '../modules';
import { createRegistry } from '../registry';
import { bedroom } from './bedroom';
import { dormitory } from './dormitory';
import { dungeon } from './dungeon';
import { kitchen } from './kitchen';
import { library } from './library';
import { living } from './living';
import { morgue } from './morgue';
import { ritual } from './ritual';
import { seance } from './seance';
import { storage } from './storage';
import type { RoomModule } from './types';

export type { RoomModule } from './types';

// Registration order is the picker/gallery order: the `general` family first, then the
// `horror` set — so each group's options stay contiguous and the grouped Select headers
// them cleanly ("General" then "Horror").
export const registry = createRegistry<RoomModule>([
  living,
  kitchen,
  library,
  bedroom,
  dormitory,
  storage,
  ritual,
  dungeon,
  morgue,
  seance,
]);

/** Look up a room module by id (undefined if unknown). */
export function getRoom(id: string): RoomModule | undefined {
  return registry.get(id);
}

/** Every room module, as a module summary (for the composer + gallery). */
export function listRooms(): ModuleSummary[] {
  return registry.list();
}

/** Every room module (for the knowledge loader). */
export function roomModules(): RoomModule[] {
  return registry.all();
}
