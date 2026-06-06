// Pure domain predicate shared by BOTH processes. A module (roof/basement/room)
// can declare `appliesTo` — the structure-type ids it pairs with. The main domain
// uses this to gate knowledge guides; the renderer uses it to filter the composer's
// Details selects. Keeping ONE implementation here (no `fs`/`electron`/Node) means
// the two sides can never silently disagree about what "fits".

/**
 * Does a module apply to a given host structure?
 *
 * @param appliesTo - The structure-type ids the module pairs with, or `undefined`
 *   (omitted) to mean "applies to every structure".
 * @param host - The host structure-type id to test against, or `undefined` when no
 *   structure is selected yet.
 * @returns `true` when the module has no `appliesTo` restriction, or its `appliesTo`
 *   includes `host`. A module that declares an `appliesTo` but has no `host` to match
 *   against does NOT apply.
 */
export function moduleAppliesTo(appliesTo: string[] | undefined, host: string | undefined): boolean {
  if (!appliesTo || appliesTo.length === 0) return true;
  return host !== undefined && appliesTo.includes(host);
}
