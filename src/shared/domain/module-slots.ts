// The single-select module SLOTS — the registry that makes "add a module category" a
// one-line change instead of an edit scattered across the brief, the Details form, the
// build card, the structured selection and the knowledge-guide gating. A slot is ONE
// single-select module category the user fills in the Build Planner: decoration, roof,
// basement, attic. (The STRUCTURE type — the first, family-grouped pick that
// gates everything — and the per-floor ROOMS — multi-select — are NOT slots; they keep
// their own bespoke UI.)
//
// `ModuleSlotKey` is the SHARED driver: the same string names (a) the field on
// `BuildDetails` / `BuildSelection` / `BuildBrief`, AND (b) the matching `GenerationCatalog`
// array. So those shapes DERIVE their per-category fields from this one union (see
// `shared/types/generation.ts`), and the brief/card/Details/guide code all LOOP over
// `MODULE_SLOTS` instead of hand-listing each category. Pure (no Node/electron), so both
// processes share it.
import type { MessageKey } from '../i18n';

/** The single-select module categories, by field key. Adding a category = add it here,
 *  add a `MODULE_SLOTS` entry, add the `GenerationCatalog` array + the registry, and ship
 *  the module — the brief/selection/card/Details/guides then pick it up automatically. */
export type ModuleSlotKey = 'decoration' | 'roof' | 'basement' | 'attic';

/** One single-select module category's presentation + behaviour, consumed by every
 *  generic loop over the slots. */
export interface ModuleSlot {
  /** The slot id — the field on BuildDetails/Selection/Brief AND the GenerationCatalog array. */
  key: ModuleSlotKey;
  /** `gen.fieldX` label — the Details control header + the build-card chip label. */
  fieldLabel: MessageKey;
  /** The neutral (unset) chip label for the Details select. */
  neutral: MessageKey;
  /** Whether the Details select is filtered by the chosen structure's `appliesTo` (and
   *  hidden when nothing fits). A UNIVERSAL slot (decoration) is `false` — it fits every
   *  structure and always shows. */
  filtered: boolean;
  /** Re-derive the build size when this slot changes (it grows the box — basement/attic). */
  affectsSize?: boolean;
  /** The plain-language `[Build details]` prompt bullet for a picked value (English — the
   *  model prompt isn't localized). Omit when the slot is folded into another line (the
   *  decoration rides in the main "Build a … with the … decoration" sentence). */
  brief?: (label: string) => string;
}

/** The slots, in the order they render in the Details form + the build card. */
export const MODULE_SLOTS: ModuleSlot[] = [
  {
    key: 'decoration',
    fieldLabel: 'gen.fieldDecoration',
    neutral: 'gen.optDefault',
    filtered: false,
  },
  {
    key: 'roof',
    fieldLabel: 'gen.fieldRoof',
    neutral: 'gen.optAuto',
    filtered: true,
    brief: (l) => `- Roof: a ${l} roof (see its module guide).\n`,
  },
  {
    key: 'basement',
    fieldLabel: 'gen.fieldBasement',
    neutral: 'gen.optNone',
    filtered: true,
    affectsSize: true,
    brief: (l) => `- Basement: a ${l} (see its module guide).\n`,
  },
  {
    key: 'attic',
    fieldLabel: 'gen.fieldAttic',
    neutral: 'gen.optNone',
    filtered: true,
    affectsSize: true,
    brief: (l) => `- Attic: a ${l} in the roof void (see its module guide).\n`,
  },
];
