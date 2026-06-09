// Loads the `knowledge/nbt/**.md` guides — the agent's "training" for generating
// structures — into the model's system context. Resolved like the content pack: an
// override, the packaged resource, or the repo folder. CORE guides (everything not
// under `nbt/modules/`) always load; MODULE guides (per structure/decoration/…) load
// only when their module is selected or the prompt calls for them, to keep the cached
// system prompt — and so the per-round token/latency cost — down.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { coreGuideIncluded, includedModuleGuides, isModuleGuide, type ModuleSelection } from './knowledge-select';

export { coreGuideIncluded, includedModuleGuides, isConditionalCore, isModuleGuide } from './knowledge-select';
export type { ModuleSelection } from './knowledge-select';

/** Locate the knowledge folder: explicit override, bundled resource, or repo root. */
export function knowledgeDir(): string {
  if (process.env.BW_KNOWLEDGE) return process.env.BW_KNOWLEDGE;
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'knowledge')]
    : [path.join(app.getAppPath(), 'knowledge'), path.join(process.cwd(), 'knowledge')];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

// Per-file bodies, read once. The `path` is relative to knowledgeDir() with forward
// slashes (e.g. `nbt/00-volumetric-ops.md`, `nbt/modules/structure/house.md`) so it
// matches the module guide paths declared in the domain. The composed system text is
// rebuilt per call (cheap string join) since the included set depends on the build.
let fileCache: { path: string; body: string }[] | null = null;

/** Recursively collect `*.md` files under `dir`, returning each path relative to
 *  `root` with forward slashes. */
function walkMarkdown(dir: string, root: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMarkdown(full, root));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

function loadFiles(): { path: string; body: string }[] {
  if (fileCache) return fileCache;
  const root = knowledgeDir();
  const rels = walkMarkdown(path.join(root, 'nbt'), root).sort();
  const out: { path: string; body: string }[] = [];
  for (const rel of rels) {
    try {
      out.push({ path: rel, body: fs.readFileSync(path.join(root, rel), 'utf8') });
    } catch {
      // Skip an unreadable guide rather than failing the whole load.
    }
  }
  fileCache = out;
  return fileCache;
}

/** The knowledge guides for `prompt` + `selection`, concatenated: every always-on CORE
 *  guide, each CONDITIONAL core guide whose build-characteristic gate passes, plus each
 *  selected/keyword-matched MODULE guide. Each file is fenced with its path so the model
 *  can cite specific guides; reading order follows the path sort (core `nbt/00..` first,
 *  then `nbt/modules/…`). The README is excluded (it's an index for humans, not
 *  generation guidance). */
export function loadKnowledge(prompt = '', selection?: ModuleSelection): string {
  const files = loadFiles();
  const included = includedModuleGuides(prompt, selection);
  return files
    .filter((f) => f.path.toLowerCase() !== 'nbt/readme.md')
    .filter((f) => (isModuleGuide(f.path) ? included.has(f.path) : coreGuideIncluded(f.path, prompt, selection)))
    .map((f) => `===== knowledge/${f.path} =====\n${f.body}`)
    .join('\n\n');
}
