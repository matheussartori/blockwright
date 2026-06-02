// Loads the `knowledge/nbt/*.md` guides — the agent's "training" for generating
// structures — and concatenates them into one document used as cached system
// context for the model. Resolved like the content pack: an override, the
// packaged resource, or the repo folder.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Locate the knowledge folder: explicit override, bundled resource, or repo root. */
export function knowledgeDir(): string {
  if (process.env.BW_KNOWLEDGE) return process.env.BW_KNOWLEDGE;
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'knowledge')]
    : [path.join(app.getAppPath(), 'knowledge'), path.join(process.cwd(), 'knowledge')];
  return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
}

let cache: string | null = null;

/** All NBT guides concatenated (cached). Each file is fenced with its name so
 *  the model can cite specific guides; reading order follows the README. */
export function loadKnowledge(): string {
  if (cache) return cache;
  const dir = path.join(knowledgeDir(), 'nbt');
  let files: string[];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort(); // 01-, 02-, … README sorts last among uppercase — fine as context.
  } catch {
    cache = '';
    return cache;
  }
  const parts: string[] = [];
  for (const file of files) {
    try {
      const body = fs.readFileSync(path.join(dir, file), 'utf8');
      parts.push(`===== knowledge/nbt/${file} =====\n${body}`);
    } catch {
      // Skip an unreadable guide rather than failing the whole load.
    }
  }
  cache = parts.join('\n\n');
  return cache;
}
