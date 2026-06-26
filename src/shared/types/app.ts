// App/UI contracts that don't belong to a single data domain: file export, the
// floating-window menu state, the Block Catalog, and the composable-generation
// registry surfaced to the composer's preset picker.
import type { FurnishingPreset } from '../domain/furnishing';

/** Result of exporting (copying) the current build's `.nbt` to a user-chosen
 *  location via the native Save dialog. `splitPieces` is set when the structure
 *  exceeded the size limit and was cut into a jigsaw assembly folder instead of a
 *  single file (`path` is that folder). */
export type ExportResult =
  | { ok: true; path: string; splitPieces?: number }
  | { ok: false; canceled?: boolean; error?: string };

/** The standardized panels/windows the View menu can show/hide. `console` is the
 *  bottom log dock (see `LogEntry`); like `controls` it tracks visibility only. */
export type WindowId = 'controls' | 'inspector' | 'jigsaw' | 'generate' | 'versions' | 'console';

/** A newer GitHub Release than the running app, surfaced as the update banner.
 *  Carries enough to tell the user what's new + send them to the download page
 *  (the actual install is Squirrel's job on Windows / a manual download on
 *  macOS+Linux, since an unsigned mac build can't self-apply — see main/updater.ts). */
export interface UpdateInfo {
  /** The release version, normalized (no leading `v`), e.g. "1.2.0". */
  version: string;
  /** The GitHub Release page URL, opened externally by the Download action. */
  url: string;
  /** The release notes/body, if any (shown truncated in the banner tooltip). */
  notes?: string;
}

/** A captured console message, shared from either process into the in-app Console
 *  dock so packaged builds surface the same logs the dev terminal shows. */
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
export type LogSource = 'main' | 'renderer';
/** Optional category for a log line, used to colour-code the Console dock during AI
 *  generation: `ai` = the model's own steps (planning/emitting/reviewing), `fix` =
 *  the code-side fine-tuning passes that repair the model's build. */
export type LogTag = 'ai' | 'fix';
export interface LogEntry {
  /** Epoch milliseconds when the message was emitted. */
  ts: number;
  level: LogLevel;
  source: LogSource;
  /** The fully formatted, single-string message (args already joined). */
  text: string;
  /** Category badge/colour for the Console dock (AI step vs code fix-up). */
  tag?: LogTag;
}

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

/** How aggressively AI generation should reach for the active mod workspace's own
 *  blocks (only meaningful while a workspace is open). A property of the WORKSPACE,
 *  persisted with its block dictionary: `off` = vanilla only; `mix` = offer the mod's
 *  blocks alongside vanilla; `prefer` = lean on them for the build's main materials. */
export type ModBlockScope = 'off' | 'mix' | 'prefer';

/** A user-authored annotation for one mod block, persisted SPARSELY in the workspace's
 *  `blockwright/dictionary.json` — only blocks the user has actually touched are stored.
 *  These descriptions/roles are what let AI generation use non-vanilla blocks meaningfully
 *  (the model has never seen them), so the dictionary doubles as the curation/allowlist. */
export interface BlockNote {
  /** Full `namespace:id` (e.g. `theplacebeyond:ashen_brick`). */
  id: string;
  /** Plain-language description steering the model: what it looks like / when to use it. */
  description?: string;
  /** Optional semantic role tag (a `Role` id like `wall`/`floor`/`light`) — the bridge
   *  that lets a mod block participate in the role system later. */
  role?: string;
  /** When true, never offer this block to AI generation (excluded from the injected set). */
  ignore?: boolean;
}

/** One row in the Block Catalog's dictionary editor: a mod block, its saved {@link BlockNote}
 *  (if any), the auto-derived suggestions shown as placeholders (so annotation is editing,
 *  not blank-slate typing), and its blockstate properties (so the model can orient it). */
export interface BlockDictEntry {
  /** Full `namespace:id`. */
  id: string;
  /** The bare block id (no namespace). */
  block: string;
  /** Texture key ("namespace/path") for the thumbnail, or null. */
  texture: string | null;
  /** The user's saved annotation, or null when untouched. */
  note: BlockNote | null;
  /** Humanized id, shown as the description placeholder. */
  suggestedDescription: string;
  /** Heuristic role guess (a `Role` id), or null — shown as the role placeholder. */
  suggestedRole: string | null;
  /** Blockstate property name → its possible values (for the model to set facing/axis/…). */
  props: Record<string, string[]>;
}

/** The active workspace's block dictionary, surfaced to the Catalog editor: the mod's
 *  namespace, its generation scope, and one {@link BlockDictEntry} per mod block. Null
 *  when no mod workspace is active. */
export interface BlockDictionary {
  namespace: string;
  scope: ModBlockScope;
  entries: BlockDictEntry[];
}

/** The generation module categories. */
export type ModuleCategory = 'structure' | 'decoration' | 'basement' | 'roof' | 'attic' | 'room' | 'surroundings';

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
  /** The structure GROUP id (structure types only) — the family this type belongs to
   *  (e.g. `'house'`). Drives the gallery rail + Details grouping and host→group
   *  resolution for `appliesTo`. */
  group?: string;
  /** Whether a 3D preview can be composed for this module (gallery). */
  hasPreview: boolean;
  /** Structure-type ids and/or group ids this module pairs with (e.g. a roof's
   *  `['house']`, the group) — a growing link. A group id shares it across the whole
   *  family; the renderer filters the composer's roof/basement/room selects on it.
   *  Omit → applies to all. */
  appliesTo?: string[];
  /** Module ids this one cannot combine with (e.g. an attic vs the `flat` roof). The
   *  link is symmetric in meaning; the gallery/Details dim or clear the conflicting pick.
   *  See `shared/domain/conflicts.ts` `modulesConflict`. Omit → conflicts with nothing. */
  incompatibleWith?: string[];
  /** Tunable params (structure types only) → the Details controls. */
  params?: ModuleParam[];
  /** Max interior rooms a single floor of this structure accepts (structure types
   *  only) — drives the planner's per-floor room cap so a roomier house allows more
   *  than a cabin. Omit → the generic default (`ROOMS_PER_FLOOR`). */
  maxRoomsPerFloor?: number;
  /** The decoration id that IS this structure's identity look (structure types only) —
   *  auto-picked in the composer Details when the structure is chosen. Declared on the
   *  module so the renderer never hardcodes a type→decoration map. */
  pairedDecoration?: string;
  /** Furnishing presets, tiered by floor space (room modules only) → the gallery's
   *  expandable per-room preset list. */
  presets?: FurnishingPreset[];
}

/** A structure family (e.g. "House") — a group several structure types belong to,
 *  letting modules be shared across the family and the UI header them together. */
export interface GenerationGroup {
  id: string;
  label: string;
}

/** The generation module registry, grouped by category (+ the structure families). */
export interface GenerationCatalog {
  structure: GenerationModule[];
  decoration: GenerationModule[];
  basement: GenerationModule[];
  roof: GenerationModule[];
  /** Attic modules (storage/bedroom) — an in-roof loft, only on pitched-roof houses. */
  attic: GenerationModule[];
  /** Interior room modules (living/kitchen/library/…) assigned per floor. */
  room: GenerationModule[];
  /** Surroundings modules (yard/pool/landscaping rings laid OUTSIDE the shell). */
  surroundings: GenerationModule[];
  /** Structure families, for the gallery rail headers + Details optgroups. */
  groups: GenerationGroup[];
}
