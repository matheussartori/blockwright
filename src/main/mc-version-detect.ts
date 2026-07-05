// Best-effort detection of a mod project's target Minecraft version, read from
// whatever declaration file it ships. We try the precise sources first
// (loader manifests, gradle.properties) and fall back to the data-pack format.
// A null result means "couldn't tell" — the renderer then asks the user.
import fs from 'node:fs';
import path from 'node:path';
import { parseMcVersion } from '@/shared/mc-version';

/** Data-pack `pack_format` → a representative version, used only as a last resort.
 *  Resolved by NEAREST KNOWN format at or below the declared one, so a format between
 *  two entries (a drop we haven't tabled yet) still detects the right family. */
const PACK_FORMAT_VERSION: Record<number, string> = {
  18: '1.20.2',
  26: '1.20.4',
  41: '1.20.6',
  48: '1.21.1',
  57: '1.21.3',
  61: '1.21.4',
  71: '1.21.5',
  107: '26.2',
};

/** Resolve a declared pack format to a version via the nearest known format ≤ it. */
function versionForPackFormat(format: number): string | null {
  let best: number | null = null;
  for (const key of Object.keys(PACK_FORMAT_VERSION)) {
    const f = Number(key);
    if (f <= format && (best === null || f > best)) best = f;
  }
  return best !== null ? PACK_FORMAT_VERSION[best] : null;
}

/** Normalize a `pack.mcmeta` format value: a plain number (48), a fractional one
 *  (107.1 — the 26.x minor-format scheme), or a `[major, minor]` pair. */
function packFormatNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (Array.isArray(value) && typeof value[0] === 'number') return Math.floor(value[0]);
  return undefined;
}

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function parseJson(file: string): Record<string, unknown> | null {
  const text = read(file);
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The Gradle project root above a `src/main/resources` resources dir, if that's
 *  the layout; otherwise the dir itself (gradle.properties may sit either place). */
function projectRootOf(resourcesRoot: string): string {
  const gradleLayout = path.join('src', 'main', 'resources');
  return resourcesRoot.endsWith(gradleLayout)
    ? path.resolve(resourcesRoot, '..', '..', '..')
    : resourcesRoot;
}

function fromFabric(resourcesRoot: string): string | null {
  const json = parseJson(path.join(resourcesRoot, 'fabric.mod.json'));
  const depends = json?.depends as Record<string, unknown> | undefined;
  return parseMcVersion(depends?.minecraft as string | undefined);
}

function fromForgeToml(resourcesRoot: string): string | null {
  for (const name of ['neoforge.mods.toml', 'mods.toml']) {
    const text = read(path.join(resourcesRoot, 'META-INF', name));
    if (!text) continue;
    // Find the [[dependencies.*]] entry for minecraft and read its versionRange.
    const block = text.match(/modId\s*=\s*"minecraft"[\s\S]{0,200}?versionRange\s*=\s*"([^"]+)"/);
    const version = parseMcVersion(block?.[1]);
    if (version) return version;
  }
  return null;
}

function fromGradle(resourcesRoot: string): string | null {
  const text = read(path.join(projectRootOf(resourcesRoot), 'gradle.properties'));
  if (!text) return null;
  const line = text.match(/^\s*(?:minecraft_version|mc_version|minecraftVersion)\s*=\s*(.+)$/m);
  return parseMcVersion(line?.[1]);
}

/** An extracted/generated vanilla pack ships a `version.json` whose `id`/`name`
 *  is the exact Minecraft version (e.g. {"id":"1.21.1",...}). This is the most
 *  authoritative source when present, so it's tried first. */
function fromVersionJson(resourcesRoot: string): string | null {
  const json = parseJson(path.join(resourcesRoot, 'version.json'));
  return parseMcVersion((json?.id ?? json?.name) as string | undefined);
}

function fromPackMeta(resourcesRoot: string): string | null {
  const json = parseJson(path.join(resourcesRoot, 'pack.mcmeta'));
  const pack = json?.pack as Record<string, unknown> | undefined;
  if (!pack) return null;
  // The year-numbered releases replaced `pack_format` with a `min_format`/`max_format`
  // range. The classic single-target field wins when present; otherwise `min_format`
  // ("requires at least") is the conservative target, with `max_format` as a last resort.
  const format =
    packFormatNumber(pack.pack_format) ??
    packFormatNumber(pack.min_format) ??
    packFormatNumber(pack.max_format);
  return format !== undefined ? versionForPackFormat(format) : null;
}

/** Detect the Minecraft version a workspace or content pack targets, or null if
 *  undeterminable. `resourcesRoot` is the dir that owns `assets/`/`data/` — for a
 *  mod its project/resources root, for the vanilla pack the content-pack dir. */
export function detectMcVersion(resourcesRoot: string): string | null {
  return (
    fromVersionJson(resourcesRoot) ??
    fromFabric(resourcesRoot) ??
    fromForgeToml(resourcesRoot) ??
    fromGradle(resourcesRoot) ??
    fromPackMeta(resourcesRoot)
  );
}
