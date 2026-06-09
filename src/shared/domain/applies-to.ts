// Pure domain predicate shared by BOTH processes. A module (roof/basement/room)
// can declare `appliesTo` — the structure-type ids OR group ids it pairs with. A
// GROUP id (e.g. `'house'`) shares the module across every member of that family, so
// one tag offers it on classic/modern/farmhouse/sakura/gothic at once; a structure id keeps it
// specific to that single type. The main domain uses this to gate knowledge guides;
// the renderer uses it to filter the composer's Details selects. Keeping ONE
// implementation here (no `fs`/`electron`/Node) means the two sides can never silently
// disagree about what "fits".

/**
 * Does a module apply to a given host structure?
 *
 * @param appliesTo - The structure-type ids and/or group ids the module pairs with,
 *   or `undefined` (omitted) to mean "applies to every structure".
 * @param host - The host structure-type id to test against, or `undefined` when no
 *   structure is selected yet.
 * @param hostGroup - The host structure's GROUP id (its family), or `undefined`. Lets
 *   a module tagged with the group id apply to every member of that group.
 * @returns `true` when the module has no `appliesTo` restriction, or its `appliesTo`
 *   includes `host` or `hostGroup`. A module that declares an `appliesTo` but has no
 *   `host`/`hostGroup` to match against does NOT apply.
 */
export function moduleAppliesTo(
  appliesTo: string[] | undefined,
  host: string | undefined,
  hostGroup?: string | undefined,
): boolean {
  if (!appliesTo || appliesTo.length === 0) return true;
  if (host !== undefined && appliesTo.includes(host)) return true;
  if (hostGroup !== undefined && appliesTo.includes(hostGroup)) return true;
  return false;
}
