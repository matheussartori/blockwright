// The mod-block DICTIONARY: per-workspace annotations that let AI generation use a
// mod's own blocks. The model has never seen `theplacebeyond:ashen_brick` — it doesn't
// know what it looks like, what role it plays, or which blockstate props it has — so the
// user describes the blocks worth building with, once, in the Block Catalog. Describing a
// block IS curating it: the dictionary is the allowlist, the knowledge, and the curation.
//
// Storage is WITH the mod (it's authoring metadata about the mod, like fabric.mod.json),
// in a VISIBLE `blockwright/dictionary.json` at the workspace's resources root — so it
// travels when the folder moves, survives a clone, and can be committed. The file is
// SPARSE: only blocks the user has touched are stored (sorted by id for clean diffs); the
// auto-derived suggestions are computed in memory, so new mod blocks show up for free.
import fs from 'node:fs';
import path from 'node:path';
import type { BlockDictEntry, BlockDictionary, BlockNote, ModBlockScope, Workspace } from '@/shared/types';
import { assetsDir, getActiveWorkspace, loadJson } from './content-pack';
import { listCatalog } from '../catalog/block-catalog';
import { parseRef } from './model-loader';
import { ROLES } from '../domain/roles';
import {
  type BlockstateJson,
  type GuideEntry,
  type RoleCandidate,
  buildRolePalette,
  formatModBlockSection,
  guessRole,
  humanize,
  propsFromState,
} from './block-dictionary-derive';

/** Default generation scope for a workspace with a dictionary but no explicit choice:
 *  offer the mod's blocks alongside vanilla. */
const DEFAULT_SCOPE: ModBlockScope = 'mix';

const ABOUT =
  'Blockwright AI block notes — descriptions/roles that help AI generation use this mod\'s blocks. ' +
  'Edit them in Blockwright ▸ Block Catalog. Safe to commit.';

/** The on-disk shape of `blockwright/dictionary.json`. */
interface DictionaryFile {
  _about?: string;
  namespace: string;
  scope?: ModBlockScope;
  notes: BlockNote[];
}

const ROLE_SET = new Set<string>(ROLES);

// Cached per workspace root (the file is re-read only when the workspace changes); the
// catalog/JSON caches are cleared on a workspace switch alongside this one.
let cache: { root: string; file: DictionaryFile } | null = null;
// The built editor rows (catalog × notes × props), memoized per workspace root: `buildEntries`
// is recomputed twice per generation (the guide + the shell role-overrides) plus on every
// catalog fetch. Invalidated wherever the notes file is written or the workspace switches.
let entriesCache: { root: string; entries: BlockDictEntry[] } | null = null;

function dictionaryDir(ws: Workspace): string {
  return path.join(ws.root, 'blockwright');
}

function dictionaryPath(ws: Workspace): string {
  return path.join(dictionaryDir(ws), 'dictionary.json');
}

/** Read (and cache) the sparse dictionary file for a workspace, tolerating a missing or
 *  malformed file by returning an empty dictionary. */
function readFile(ws: Workspace): DictionaryFile {
  if (cache && cache.root === ws.root) return cache.file;
  let file: DictionaryFile = { namespace: ws.namespace, notes: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(dictionaryPath(ws), 'utf8')) as Partial<DictionaryFile>;
    file = {
      namespace: ws.namespace,
      scope: raw.scope,
      notes: Array.isArray(raw.notes) ? raw.notes.filter((n): n is BlockNote => !!n && typeof n.id === 'string') : [],
    };
  } catch {
    // No dictionary yet (or unreadable) — start empty.
  }
  cache = { root: ws.root, file };
  return file;
}

/** Persist the file (sorted by id, with the self-describing header), updating the cache.
 *  Best-effort: a failed write just means the annotation won't survive a restart. */
function writeFile(ws: Workspace, file: DictionaryFile): void {
  const sorted: DictionaryFile = {
    _about: ABOUT,
    namespace: ws.namespace,
    ...(file.scope ? { scope: file.scope } : {}),
    notes: [...file.notes].sort((a, b) => a.id.localeCompare(b.id)),
  };
  cache = { root: ws.root, file: sorted };
  entriesCache = null; // a note/scope edit changes the built rows — rebuild on next read
  try {
    fs.mkdirSync(dictionaryDir(ws), { recursive: true });
    fs.writeFileSync(dictionaryPath(ws), JSON.stringify(sorted, null, 2));
  } catch {
    // Ignore — the in-memory cache still reflects the change for this session.
  }
}

/** Drop the cached dictionary so the next read reflects a new workspace (called from
 *  `applyWorkspace`, alongside the JSON/model cache clears). */
export function clearDictionaryCache(): void {
  cache = null;
  entriesCache = null;
}

/** A note is "empty" once the user clears every field — we drop it from the sparse file
 *  rather than store a no-op entry. */
function isEmptyNote(note: BlockNote): boolean {
  return !note.description?.trim() && !note.role && !note.ignore;
}

/** Extract a block's blockstate property name → possible values (for the editor/guide), by
 *  reading + parsing its blockstate JSON. */
function blockProps(id: string): Record<string, string[]> {
  const { namespace, path: name } = parseRef(id);
  const state = loadJson(path.join(assetsDir(namespace), 'blockstates', `${name}.json`)) as BlockstateJson | null;
  return propsFromState(state);
}

/** The mod-namespace blocks of the active content, as dictionary editor rows: each with
 *  its saved note, auto suggestions, and blockstate props. Vanilla blocks are excluded —
 *  the model already knows them. */
function buildEntries(ws: Workspace): BlockDictEntry[] {
  if (entriesCache && entriesCache.root === ws.root) return entriesCache.entries;
  const notesById = new Map(readFile(ws).notes.map((n) => [n.id, n]));
  const entries = listCatalog()
    .filter((b) => b.namespace === ws.namespace && b.namespace !== 'minecraft')
    .map((b) => ({
      id: b.id,
      block: b.block,
      texture: b.texture,
      note: notesById.get(b.id) ?? null,
      suggestedDescription: humanize(b.block),
      suggestedRole: guessRole(b.block),
      props: blockProps(b.id),
    }));
  entriesCache = { root: ws.root, entries };
  return entries;
}

/** The active workspace's dictionary (namespace + scope + one row per mod block), or null
 *  when no mod workspace is open. Drives the Block Catalog's annotation editor. */
export function getDictionary(): BlockDictionary | null {
  const ws = getActiveWorkspace();
  if (!ws || ws.namespace === 'minecraft') return null;
  const file = readFile(ws);
  return { namespace: ws.namespace, scope: file.scope ?? DEFAULT_SCOPE, entries: buildEntries(ws) };
}

/** Upsert (or, when cleared to empty, remove) one block's annotation, sanitising the role
 *  to a known id. Returns the refreshed dictionary, or null if no workspace is active. */
export function setBlockNote(input: BlockNote): BlockDictionary | null {
  const ws = getActiveWorkspace();
  if (!ws || ws.namespace === 'minecraft') return null;
  const file = readFile(ws);
  const note: BlockNote = {
    id: input.id,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.role && ROLE_SET.has(input.role) ? { role: input.role } : {}),
    ...(input.ignore ? { ignore: true } : {}),
  };
  const notes = file.notes.filter((n) => n.id !== input.id);
  if (!isEmptyNote(note)) notes.push(note);
  writeFile(ws, { ...file, notes });
  return getDictionary();
}

/** Set the workspace's generation scope (persisted in the dictionary file). Returns the
 *  refreshed dictionary, or null if no workspace is active. */
export function setScope(scope: ModBlockScope): BlockDictionary | null {
  const ws = getActiveWorkspace();
  if (!ws || ws.namespace === 'minecraft') return null;
  writeFile(ws, { ...readFile(ws), scope });
  return getDictionary();
}

/** The system-prompt section that teaches the model the active mod's blocks: every
 *  non-ignored mod block with its props (so it can orient them) plus the user's role /
 *  description when authored, steered by the workspace scope. Returns '' when there is no
 *  mod workspace, the scope is off, or nothing usable is annotated — so a vanilla run pays
 *  nothing. Reads the live workspace + scope from disk; called once per generation. */
/**
 * The system-prompt section teaching the model the active mod's blocks.
 * @param seeded - Whether THIS run seeded a code-built shell (compiled in these mod blocks),
 *   so the guide can truthfully say "the shell is already built in them" only when it is —
 *   a free-form / edit build seeds no shell.
 */
export function modBlockGuide(seeded = false): string {
  const ws = getActiveWorkspace();
  if (!ws || ws.namespace === 'minecraft') return '';
  const file = readFile(ws);
  const scope = file.scope ?? DEFAULT_SCOPE;
  if (scope === 'off') return '';
  // Non-ignored mod blocks → the model-facing entries (props + any authored role/desc);
  // the pure formatter sorts/caps/renders. '' when nothing is usable.
  const usable = buildEntries(ws).filter((e) => !e.note?.ignore);
  const entries: GuideEntry[] = usable.map((e) => ({ id: e.id, role: e.note?.role, description: e.note?.description, props: e.props }));
  // The recommended role→block palette: the SAME map the seeded shell is compiled with
  // (see modRoleOverrides), so the guide tells the model exactly which mod block plays
  // each role and to keep using it for everything it adds.
  const roles = buildRolePalette(roleCandidates(usable), scope === 'mix');
  return formatModBlockSection(ws.namespace, scope, entries, roles, seeded);
}

/** The mod blocks as role candidates (annotated role + heuristic guess), stably ordered
 *  so the role→block pick is deterministic — shared by the guide and the shell overrides. */
function roleCandidates(entries: BlockDictEntry[]): RoleCandidate[] {
  return [...entries]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => ({ id: e.id, role: e.note?.role, guessed: e.suggestedRole ?? undefined }));
}

/** The role→mod-block override map that makes a FRESH build come out in the mod's blocks:
 *  fed into the seeded shell's `template` op as `params.modBlocks`, so the code-built (and
 *  then LOCKED) exterior compiles in mod materials with their custom blockstate props. `{}`
 *  when there's no mod workspace, the scope is off, or nothing maps — so a vanilla run is
 *  untouched. `mix` rides only the user-annotated roles in; `prefer` adds heuristic fills.
 *  Reads the live workspace + scope from disk; called once per generation. */
export function modRoleOverrides(): Record<string, string> {
  try {
    const ws = getActiveWorkspace();
    if (!ws || ws.namespace === 'minecraft') return {};
    const scope = readFile(ws).scope ?? DEFAULT_SCOPE;
    if (scope === 'off') return {};
    const usable = buildEntries(ws).filter((e) => !e.note?.ignore);
    return buildRolePalette(roleCandidates(usable), scope === 'mix');
  } catch {
    // Best-effort: a catalog/asset hiccup just means a vanilla shell, never a failed build.
    return {};
  }
}
