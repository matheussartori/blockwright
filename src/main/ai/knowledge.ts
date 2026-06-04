// Loads the `knowledge/nbt/*.md` guides — the agent's "training" for generating
// structures — into the model's system context. Resolved like the content pack: an
// override, the packaged resource, or the repo folder. Big situational guides (e.g.
// the tower playbook) are only included when the prompt calls for them, to keep the
// cached system prompt — and so the per-round token/latency cost — down.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { relevantGuides } from './knowledge-select';

export { relevantGuides } from './knowledge-select';

/** Locate the knowledge folder: explicit override, bundled resource, or repo root. */
export function knowledgeDir(): string {
  if (process.env.BW_KNOWLEDGE) return process.env.BW_KNOWLEDGE;
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'knowledge')]
    : [path.join(app.getAppPath(), 'knowledge'), path.join(process.cwd(), 'knowledge')];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

// Per-file bodies, read once. The composed system text is rebuilt per call (cheap
// string join) since the included set now depends on the prompt.
let fileCache: { name: string; body: string }[] | null = null;

function loadFiles(): { name: string; body: string }[] {
  if (fileCache) return fileCache;
  const dir = path.join(knowledgeDir(), 'nbt');
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  } catch {
    fileCache = [];
    return fileCache;
  }
  const out: { name: string; body: string }[] = [];
  for (const name of names) {
    try {
      out.push({ name, body: fs.readFileSync(path.join(dir, name), 'utf8') });
    } catch {
      // Skip an unreadable guide rather than failing the whole load.
    }
  }
  fileCache = out;
  return fileCache;
}

/** The relevant NBT guides for `prompt`, concatenated. Each file is fenced with its
 *  name so the model can cite specific guides; reading order follows the README. */
export function loadKnowledge(prompt = ''): string {
  const files = loadFiles();
  const keep = new Set(relevantGuides(files.map((f) => f.name), prompt));
  return files
    .filter((f) => keep.has(f.name))
    .map((f) => `===== knowledge/nbt/${f.name} =====\n${f.body}`)
    .join('\n\n');
}
