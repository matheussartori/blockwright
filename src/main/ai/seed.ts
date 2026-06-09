// The "you are editing this structure" seed: the preamble prepended to a prompt so
// the model edits an existing build rather than starting over. Where it comes from
// depends on the provider — a resumable provider carries its own conversation, so it
// only needs the seed on the very first turn; a stateless one has no server memory,
// so it's re-seeded each turn from the latest emitted version.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readAuthoring } from '../structure/authoring';
import type { Session } from './session';

/** Wrap an authoring JSON as an edit preamble that ends with `USER REQUEST:`. */
export function editPreamble(json: string): string {
  return (
    'You are EDITING an existing structure the user already has open in the viewer — NOT building a new ' +
    'one from scratch. Below is its CURRENT Blockwright authoring JSON (air omitted; geometry is given as ' +
    'a flat "blocks" list). Treat it as the starting point: keep everything the user did not ask to change, ' +
    'apply only the requested change, and then call emit_structure with the COMPLETE modified structure. ' +
    'Keep the same size and layout for parts the change does not touch, but if the request needs more room ' +
    '(e.g. "make the basement bigger", "add rooms/corridors", "expand it"), GROW "size" freely — there is no ' +
    'width/depth limit — and RE-ANCHOR the kept parts so anything that should stay centred shifts with the ' +
    'enlarged footprint instead of being left in a corner. Resizing/re-anchoring needs mode "full" (a patch ' +
    'cannot change size or move existing cells). You may re-express unchanged geometry as "ops" ' +
    'if that is cheaper to emit, as long as the result matches.\n\n' +
    'CURRENT STRUCTURE:\n```json\n' +
    json +
    '\n```\n\nUSER REQUEST:\n'
  );
}

/** Wrap a code-built STARTING SHELL as a preamble: the model must KEEP the exterior
 *  massing and only furnish/detail it. Used for shell-seeded archetypes whose silhouette
 *  the model can't reliably invent on its own (the modern villa; any build with a
 *  geometry-bearing exterior style like the farmhouse veranda). The text is GENERIC —
 *  "keep whatever this shell is" — so it fits a flat-roofed villa and a porched farmhouse
 *  alike, instead of naming modern-only features. */
export function shellPreamble(json: string): string {
  return (
    'You are FINISHING a structure whose EXTERIOR has already been built for you by code, below as ' +
    'Blockwright authoring JSON (air omitted; geometry is a flat "blocks" list). This shell is the ' +
    'CORRECT exterior for what the user asked — KEEP its overall massing exactly as given: the ' +
    'footprint and silhouette, the ROOF FORM, the walls and cladding, and every signature exterior ' +
    'volume it already has (porches/verandas on their posts, balconies and upper galleries, exposed ' +
    'framing, projecting entry porticos, dormers, railings, the stone plinth, the stairs). Do NOT ' +
    'flatten it back into a plain box, do NOT re-roof it, and do NOT re-clad or strip those volumes — ' +
    'they ARE the requested style. Your job is to: furnish the interior room-by-room, connect the rooms ' +
    'to any porch/gallery doors, add finishing exterior detail (greenery/hedges/planters/flower boxes, ' +
    'outdoor steps, porch furniture, lighting), fix anything unsound, and otherwise REFINE — not ' +
    'replace — this shell. Then call emit_structure with the COMPLETE structure (mode "full"). Keep the ' +
    'same size unless the request clearly needs more room.\n\n' +
    'STARTING SHELL:\n```json\n' +
    json +
    '\n```\n\nUSER REQUEST:\n'
  );
}

/** Read an existing `.nbt` and wrap it as an edit preamble, or '' if unreadable. */
async function seedFromFile(basePath: string): Promise<string> {
  try {
    const authoring = await readAuthoring(basePath);
    return editPreamble(JSON.stringify(authoring));
  } catch {
    return '';
  }
}

/** Decide the edit preamble for this turn. Resumable providers carry their own
 *  conversation, so they only seed from the open file on the very first turn.
 *  Stateless providers have no server-side memory, so they re-seed every turn from
 *  the latest emitted version (or the open file on turn one). */
export async function buildSeed(resumable: boolean, session: Session, basePath: string | undefined): Promise<string> {
  const fromOpenFile = async (): Promise<string> => {
    if (!basePath) return '';
    // Never re-seed from our own output (that's what the version-based path is for).
    const isOwnOutput = path.resolve(basePath).startsWith(path.resolve(session.dir) + path.sep);
    return isOwnOutput ? '' : seedFromFile(basePath);
  };
  if (resumable) {
    return session.sdkSessionId === null && session.version === 0 ? fromOpenFile() : '';
  }
  if (session.version >= 1) {
    const latest = path.join(session.dir, `v${session.version}.json`);
    try {
      return editPreamble(await fsp.readFile(latest, 'utf8'));
    } catch {
      return '';
    }
  }
  return fromOpenFile();
}
