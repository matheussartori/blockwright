// The Room contract (category "room"). A room module is an INTERIOR program — a
// living room, a kitchen, a bedroom — that the user assigns to a floor of a host
// structure (up to two per floor). Rooms are GUIDANCE-ONLY: they carry no geometry
// of their own. The actual furnishing is built by the AI from the room's knowledge
// guide, exactly like every other interior; a selected room loads only its own guide
// (so an unused room guide never bloats the system prompt) and rides into the prompt
// as a plain-language "[Room plan]" line per floor.
//
// `category` is always `'room'`. Rooms declare `appliesTo` to link them to the
// structures they fit (house for now); they have no `build`, `params`, or `preview`.
import type { FurnishingPreset } from '@/shared/domain/furnishing';
import type { ModuleMeta } from '../modules';

export interface RoomModule extends ModuleMeta {
  category: 'room';
  /** The structure-type ids this room pairs with — REQUIRED (narrows ModuleMeta's optional
   *  `appliesTo`): a room must explicitly say which structures it fits, never silently apply
   *  to all. A growing list — start with `['house']`, add more (e.g. `'tower'`) later. */
  appliesTo: string[];
  /** Furnishing presets tiered by floor space (snug / standard / grand) — the SPACE ×
   *  DECORATION organism: a decoration-agnostic base layout per tier that the composer
   *  brief selects from (by the room's computed area) and the gallery lists. REQUIRED so
   *  every room scales its furnishing to the room instead of coming out empty in a big
   *  hall. See `@/shared/domain/furnishing`. */
  presets: FurnishingPreset[];
}
