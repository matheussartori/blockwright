// The room factory: turns a room's pure data into a full RoomModule, applying the
// shared conventions in ONE place so every room file stays boilerplate-free and the
// conventions can't drift between rooms. A room file declares only what is specific to
// that room (label, description, presets); `defineRoom` fills in the rest of the
// contract — the `room` category, the knowledge-guide path, and each preset's id.
import type { FurnishingPreset } from '@/shared/domain/furnishing';
import type { RoomModule } from './types';

/** The structures a room pairs with unless it says otherwise. A GROWING link: a room
 *  built for the house is reused on another structure by listing it in the room's
 *  `appliesTo` (e.g. `['house', 'tower']`) — see `defineRoom`'s `appliesTo`. */
const DEFAULT_HOSTS = ['house'];

/** A preset as AUTHORED in a room file: a {@link FurnishingPreset} minus its `id`, which
 *  `defineRoom` derives from the room id + the preset's `scale` (`<room>-<scale>`). So a
 *  room declares each preset by its space tier, never repeating an id by hand. */
export type RoomPreset = Omit<FurnishingPreset, 'id'>;

/** The room-specific data a room file declares; {@link defineRoom} completes the
 *  {@link RoomModule} contract around it. */
export interface RoomDef {
  /** Stable id (used in the `template`/IPC/UI and to derive the guide + preset ids). */
  id: string;
  /** Human label for the picker + gallery. */
  label: string;
  /** One-paragraph gallery description (what it furnishes, when to use it). */
  description: string;
  /** The structures this room fits; defaults to {@link DEFAULT_HOSTS} (`['house']`).
   *  Extend it to reuse the room on another structure type (the growing host link). */
  appliesTo?: string[];
  /** One preset per space tier (snug / standard / grand). */
  presets: RoomPreset[];
}

/** Build a full {@link RoomModule} from a room's data, applying the shared conventions:
 *  the `room` category, the knowledge guide at `nbt/modules/room/<id>.md`, the default
 *  host link, and each preset's id as `<id>-<scale>`. Centralising these keeps every
 *  room file to pure room-specific data.
 *  @param def - The room-specific declaration.
 *  @returns The complete room module for the registry. */
export function defineRoom(def: RoomDef): RoomModule {
  return {
    id: def.id,
    label: def.label,
    category: 'room',
    description: def.description,
    knowledge: `nbt/modules/room/${def.id}.md`,
    appliesTo: def.appliesTo ?? [...DEFAULT_HOSTS],
    presets: def.presets.map((p) => ({ ...p, id: `${def.id}-${p.scale}` })),
  };
}
