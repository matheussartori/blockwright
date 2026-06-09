// Decoration registry (category "decoration"). Register a new decoration here and it
// immediately composes with every structure type. The default is "cozy" so a bare
// `template` op (no decoration param) builds a warm, intact look.
import type { ModuleSummary } from '../modules';
import { createRegistry } from '../registry';
import { cozy } from './cozy';
import { haunted } from './haunted';
import { modern } from './modern';
import type { Decoration } from './types';

export type { Decoration, DecorationTheme } from './types';

const registry = createRegistry<Decoration>([cozy, haunted, modern]);

/** The decoration used when a `template` op doesn't name one. */
export const DEFAULT_DECORATION = cozy.id;

/** Look up a decoration by id (undefined if unknown). */
export function getDecoration(id: string): Decoration | undefined {
  return registry.get(id);
}

/** Every registered decoration id (for validation / UI / prompts). */
export function decorationIds(): string[] {
  return registry.ids();
}

/** Every decoration, as a module summary (for the composer picker + gallery). */
export function listDecorations(): ModuleSummary[] {
  return registry.list();
}

/** Every decoration module (for the knowledge loader / gallery preview). */
export function decorationModules(): Decoration[] {
  return registry.all();
}
