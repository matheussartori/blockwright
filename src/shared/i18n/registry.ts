// Localization for REGISTRY DATA — the labels/descriptions authored in English
// INSIDE the registries (`structure/domain` modules, their params + furnishing
// presets, and `shared/ai.ts` providers/presets). Unlike the UI-chrome catalogs
// (en.ts / pt-BR.ts), English is canonical at the source here, so a locale only
// supplies OVERRIDES keyed by a stable data-key; a missing key falls back to the
// English the call site passes in. The key builders below are the SINGLE source
// of those keys, shared by the override catalog (data-pt-BR.ts) and every call
// site, so the two can't drift.
import type { GenerationCatalog, GenerationModule, ModuleCategory, ModuleParam } from '@/shared/types';
import type { FurnishingPreset } from '@/shared/domain/furnishing';
import type { Locale } from './index';
import { dataPtBR } from './data-pt-BR';

/** Per-locale OVERRIDE maps for registry data (English is the implicit fallback). */
const DATA_CATALOGS: Partial<Record<Locale, Record<string, string>>> = {
  'pt-BR': dataPtBR,
};

/** Localize one registry-data string: the override for `key` in `locale`, or the
 *  canonical `english` when the locale is the default or has no override. */
export function localizeData(locale: Locale, key: string, english: string): string {
  return DATA_CATALOGS[locale]?.[key] ?? english;
}

/** The data-keys a locale supplies — used by the i18n coverage test. */
export function dataCatalogKeys(locale: Locale): string[] {
  return Object.keys(DATA_CATALOGS[locale] ?? {});
}

// --- key builders (the single source of every registry-data key) ------------

/** Module label/description keys (category-qualified: ids repeat across categories). */
export const moduleKey = (cat: ModuleCategory, id: string) => ({
  label: `mod.${cat}.${id}.label`,
  desc: `mod.${cat}.${id}.desc`,
});
/** Tunable-param label key + per-enum-option label keys. */
export const paramKey = (name: string) => `param.${name}.label`;
export const paramOptionKey = (name: string, value: string) => `param.${name}.opt.${value}`;
/** Structure-group (family) label key. */
export const groupKey = (id: string) => `group.${id}`;
/** Furnishing-preset label/summary/per-furnishing keys (room id + space tier). */
export const presetKey = (roomId: string, scale: string) => ({
  label: `room.${roomId}.${scale}.label`,
  summary: `room.${roomId}.${scale}.summary`,
  furnishing: (i: number) => `room.${roomId}.${scale}.f${i}`,
});
/** AI provider + generation-preset keys (shared/ai.ts data shown in Settings). */
export const aiProviderKey = (id: string) => ({ label: `aiprov.${id}.label`, blurb: `aiprov.${id}.blurb` });
export const aiPresetKey = (id: string) => ({ label: `aipreset.${id}.label`, blurb: `aipreset.${id}.blurb` });

// --- localizers --------------------------------------------------------------

function localizePreset(roomId: string, p: FurnishingPreset, locale: Locale): FurnishingPreset {
  const k = presetKey(roomId, p.scale);
  return {
    ...p,
    label: localizeData(locale, k.label, p.label),
    summary: localizeData(locale, k.summary, p.summary),
    furnishings: p.furnishings.map((f, i) => localizeData(locale, k.furnishing(i), f)),
  };
}

function localizeParam(p: ModuleParam, locale: Locale): ModuleParam {
  const label = localizeData(locale, paramKey(p.name), p.label);
  if (p.kind === 'enum') {
    return {
      ...p,
      label,
      options: p.options.map((o) => ({ ...o, label: localizeData(locale, paramOptionKey(p.name, o.value), o.label) })),
    };
  }
  return { ...p, label };
}

function localizeModule(m: GenerationModule, locale: Locale): GenerationModule {
  const k = moduleKey(m.category, m.id);
  return {
    ...m,
    label: localizeData(locale, k.label, m.label),
    description: localizeData(locale, k.desc, m.description),
    params: m.params?.map((p) => localizeParam(p, locale)),
    presets: m.presets?.map((p) => localizePreset(m.id, p, locale)),
  };
}

/** Localize a whole module catalog (modules, their params + furnishing presets,
 *  and the structure-group labels) into `locale`. Pure — call it at the IPC
 *  boundary in main with the active locale. A no-op for the default locale. */
export function localizeCatalog(catalog: GenerationCatalog, locale: Locale): GenerationCatalog {
  const out = {} as GenerationCatalog;
  for (const [category, value] of Object.entries(catalog) as [keyof GenerationCatalog, unknown][]) {
    if (category === 'groups') {
      out.groups = catalog.groups?.map((g) => ({ ...g, label: localizeData(locale, groupKey(g.id), g.label) }));
    } else {
      (out as unknown as Record<string, unknown>)[category] = (value as GenerationModule[]).map((m) =>
        localizeModule(m, locale),
      );
    }
  }
  return out;
}
