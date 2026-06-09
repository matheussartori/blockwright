// The module model that unifies the generation domain. Every buildable piece —
// a STRUCTURE (house), a DECORATION (cozy), a BASEMENT, a ROOF, an ATTIC, a ROOM —
// is a "module" belonging to one CATEGORY. A module carries shared metadata
// (label, description, the knowledge guide it owns, and how to preview it) on top
// of its category-specific behaviour contract. This is what lets one UI list them,
// one knowledge loader pull only the selected guides, and one gallery preview them.
import type { FurnishingPreset } from '@/shared/domain/furnishing';

/** The module categories. Selected at creation; surfaced in the gallery. */
export type ModuleCategory = 'structure' | 'decoration' | 'basement' | 'roof' | 'attic' | 'room';

/** How to build a representative structure for the gallery's 3D preview. The IPC
 *  layer composes this (via a `template` op) and compiles it to a real `.nbt`. */
export interface PreviewSpec {
  /** Box size [W, H, D] to compose the representative build into. */
  size: [number, number, number];
  /** Extra `template` params (e.g. `{ crown: 'spire' }`). The category supplies the
   *  other half: a structure preview adds the default decoration, a decoration
   *  preview adds a default host structure. */
  params?: Record<string, unknown>;
}

/** Shared metadata every module declares, regardless of category. */
export interface ModuleMeta {
  /** Stable id used in the `template` op, IPC, and UI selection. */
  id: string;
  /** Human label for the picker + gallery. */
  label: string;
  /** Which category this module belongs to. */
  category: ModuleCategory;
  /** One-paragraph description for the gallery screen (what it builds, when to use). */
  description: string;
  /** Path (relative to the knowledge dir, e.g. `nbt/modules/structure/house.md`) of
   *  this module's guide. Loaded into the system prompt only when the module is
   *  selected (see ai/knowledge.ts). Omit for modules with no dedicated guide. */
  knowledge?: string;
  /** Prompt keywords that should pull this module's guide even without an explicit
   *  selection (e.g. a structure whose keywords match the prompt). Omit for modules
   *  that should only load when explicitly selected. */
  keywords?: RegExp;
  /** Structure-type ids AND/OR group ids this module pairs with (e.g. a roof's
   *  `['house']` — the GROUP, so it's shared across every house-family member). A
   *  GROWING link: tag the whole family via its group, or narrow to specific structures
   *  (e.g. `['classic']`, or `['classic', 'cabin']`). Drives the composer Details
   *  filtering + knowledge-guide gating (`moduleAppliesTo`, which resolves the host's
   *  group). Omit → applies to every structure (decorations, which cross with all types).
   *  The roof/basement/room contracts narrow this to REQUIRED, so those always declare
   *  their links explicitly rather than silently applying to all. */
  appliesTo?: string[];
  /** Module ids this one cannot combine with (e.g. an attic vs the `flat` roof, which
   *  leaves no roof void). Symmetric in meaning (see `shared/domain/conflicts.ts`); the
   *  gallery dims and Details clears the conflicting pick. Omit → conflicts with nothing. */
  incompatibleWith?: string[];
  /** How to render this module in the gallery (omit → no preview). */
  preview?: PreviewSpec;
}

/** A structure type's tunable param, projected for the composer's Details controls
 *  (`unit` params like decay are not surfaced — see `paramFields`). */
export type ModuleParam =
  | { name: string; kind: 'int'; label: string; default: number; min: number; max: number }
  | { name: string; kind: 'enum'; label: string; default: string; options: { value: string; label: string }[] };

/** The category-agnostic shape the gallery + Details selects consume. */
export interface ModuleSummary {
  id: string;
  label: string;
  category: ModuleCategory;
  description: string;
  /** The structure GROUP id (structure types only) — drives the gallery/Details
   *  grouping header and the host→group resolution for `moduleAppliesTo`. */
  group?: string;
  /** Whether a 3D preview can be composed for this module. */
  hasPreview: boolean;
  /** Structure-type ids and/or group ids this module pairs with (the growing
   *  `appliesTo` link); a group id shares it across the whole family. Omit → applies
   *  to every structure. */
  appliesTo?: string[];
  /** Module ids this one cannot combine with (e.g. attic vs the `flat` roof) → the
   *  gallery dims + Details clears the conflicting pick. Omit → conflicts with nothing. */
  incompatibleWith?: string[];
  /** Tunable params (structure types only) → the Details controls. */
  params?: ModuleParam[];
  /** Max interior rooms a single floor accepts (structure types only) → the planner's
   *  per-floor room cap. Omit → the generic default. */
  maxRoomsPerFloor?: number;
  /** Furnishing presets, tiered by floor space (room modules only) → the gallery's
   *  expandable per-room preset list + the composer brief's preset selection. */
  presets?: FurnishingPreset[];
}

/** Project a module to the renderer-facing summary. Room modules carry furnishing
 *  `presets`, attached here when present so the catalog surfaces them to the gallery. */
export function toSummary(m: ModuleMeta): ModuleSummary {
  return {
    id: m.id,
    label: m.label,
    category: m.category,
    description: m.description,
    hasPreview: m.preview !== undefined,
    appliesTo: m.appliesTo,
    incompatibleWith: m.incompatibleWith,
    presets: 'presets' in m ? (m as { presets?: FurnishingPreset[] }).presets : undefined,
  };
}
