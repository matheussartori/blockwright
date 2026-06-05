// App/UI contracts that don't belong to a single data domain: file export, the
// floating-window menu state, the Block Catalog, and the composable-generation
// registry surfaced to the composer's preset picker.

/** Result of exporting (copying) the current build's `.nbt` to a user-chosen
 *  location via the native Save dialog. */
export type ExportResult =
  | { ok: true; path: string }
  | { ok: false; canceled?: boolean; error?: string };

/** The standardized panels/windows the View menu can show/hide. */
export type WindowId = 'controls' | 'inspector' | 'jigsaw' | 'generate' | 'versions';

/** Per-window state the renderer reports to main so the View menu reflects it.
 *  `available` gates the menu item's enabled state (its content can exist);
 *  `visible` drives the checkmark. */
export interface WindowMenuState {
  visible: boolean;
  available: boolean;
}

export type WindowsReport = Record<WindowId, WindowMenuState>;

/** One block in the content catalog: a placeable block discovered in the active
 *  content (vanilla pack + the mod workspace's namespace), with a representative
 *  texture key for a thumbnail (null when none could be resolved). */
export interface CatalogBlock {
  /** Full `namespace:id` (e.g. `minecraft:stone`, `theplacebeyond:ashen_block`). */
  id: string;
  namespace: string;
  /** The bare block id (no namespace). */
  block: string;
  /** Texture key ("namespace/path") for the thumbnail, or null if unresolved. */
  texture: string | null;
}

/** The four generation module categories. */
export type ModuleCategory = 'structure' | 'decoration' | 'basement' | 'roof';

/** A structure type's tunable param, projected for the composer's Details controls. */
export type ModuleParam =
  | { name: string; kind: 'int'; label: string; default: number; min: number; max: number }
  | { name: string; kind: 'enum'; label: string; default: string; options: { value: string; label: string }[] };

/** A generation module, as surfaced to the composer's selects + the module gallery. */
export interface GenerationModule {
  id: string;
  label: string;
  category: ModuleCategory;
  /** One-paragraph description for the gallery screen. */
  description: string;
  /** Whether a 3D preview can be composed for this module (gallery). */
  hasPreview: boolean;
  /** Tunable params (structure types only) → the Details controls. */
  params?: ModuleParam[];
}

/** The generation module registry, grouped by category. */
export interface GenerationCatalog {
  structure: GenerationModule[];
  decoration: GenerationModule[];
  basement: GenerationModule[];
  roof: GenerationModule[];
}
