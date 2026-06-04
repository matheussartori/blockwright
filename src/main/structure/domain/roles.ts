// The shared vocabulary of the composable build model: a STRUCTURE TYPE describes
// its massing in terms of these semantic ROLES (wall, floor, roof…), never concrete
// block ids, and a DECORATION THEME maps each role to a real 1.21.1 block. That
// indirection is what lets N types cross with M themes without N×M code.

/** A semantic block slot a structure type asks for, resolved to a concrete block
 *  by the active theme (with optional per-op override). Kept deliberately small —
 *  add a role only when a type actually needs it. */
export type Role =
  | 'air'
  | 'wall'
  | 'floor'
  | 'ceiling'
  | 'foundation'
  | 'corner'
  | 'accent'
  | 'trim'
  | 'beam'
  | 'pillar'
  | 'roof' // a *_stairs block (the roof op climbs it)
  | 'window'
  | 'glass'
  | 'door'
  | 'light';

/** Every role, as a runtime set — the single source for `isRole`. */
export const ROLES: readonly Role[] = [
  'air', 'wall', 'floor', 'ceiling', 'foundation', 'corner', 'accent', 'trim',
  'beam', 'pillar', 'roof', 'window', 'glass', 'door', 'light',
];

const ROLE_SET = new Set<string>(ROLES);

/** Is `key` one of the semantic roles? Used to treat a `template` op param whose
 *  key is a role name (e.g. `{ wall: 'minecraft:sandstone' }`) as a block override. */
export function isRole(key: string): key is Role {
  return ROLE_SET.has(key);
}

/** Last-resort block per role, used when neither a per-op override, the active theme,
 *  nor the structure type itself supplies one — so any type renders with any theme
 *  even if both are sparse. Types normally provide their own kit (`defaults`), so
 *  this is just a safety net. */
export const BASE_BLOCKS: Record<Role, string> = {
  air: 'minecraft:air',
  wall: 'minecraft:cobblestone',
  floor: 'minecraft:oak_planks',
  ceiling: 'minecraft:oak_planks',
  foundation: 'minecraft:stone',
  corner: 'minecraft:oak_log',
  accent: 'minecraft:oak_log',
  trim: 'minecraft:stone_brick_slab',
  beam: 'minecraft:oak_log',
  pillar: 'minecraft:oak_log',
  roof: 'minecraft:oak_stairs',
  window: 'minecraft:glass_pane',
  glass: 'minecraft:glass',
  door: 'minecraft:oak_door',
  light: 'minecraft:lantern',
};
