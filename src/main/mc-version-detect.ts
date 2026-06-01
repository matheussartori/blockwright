// Best-effort detection of a mod project's target Minecraft version, read from
// whatever declaration file it ships. We try the precise sources first
// (loader manifests, gradle.properties) and fall back to the data-pack format.
// A null result means "couldn't tell" — the renderer then asks the user.
import fs from 'node:fs';
import path from 'node:path';
import { parseMcVersion } from '@/shared/mc-version';

/** Data-pack `pack_format` → a representative version, used only as a last resort. */
const PACK_FORMAT_VERSION: Record<number, string> = {
  18: '1.20.2',
  26: '1.20.4',
  41: '1.20.6',
  48: '1.21.1',
  57: '1.21.3',
  61: '1.21.4',
};

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

function fromPackMeta(resourcesRoot: string): string | null {
  const json = parseJson(path.join(resourcesRoot, 'pack.mcmeta'));
  const pack = json?.pack as Record<string, unknown> | undefined;
  const format = typeof pack?.pack_format === 'number' ? pack.pack_format : undefined;
  return format !== undefined ? (PACK_FORMAT_VERSION[format] ?? null) : null;
}

/** Detect the Minecraft version a workspace targets, or null if undeterminable.
 *  `resourcesRoot` is the workspace's `root` (the dir that owns `assets/`/`data/`). */
export function detectMcVersion(resourcesRoot: string): string | null {
  return (
    fromFabric(resourcesRoot) ??
    fromForgeToml(resourcesRoot) ??
    fromGradle(resourcesRoot) ??
    fromPackMeta(resourcesRoot)
  );
}
