// Shared, type-only contracts between the main and renderer processes.
// (No runtime code lives here so both Vite bundles can import it safely.)

export type FaceDir = 'down' | 'up' | 'north' | 'south' | 'east' | 'west';

export interface ModelFace {
  /** Resolved texture key relative to the textures dir, e.g. "block/stone". Null when unresolved. */
  texture: string | null;
  /** UV rectangle in 0..16 space: [x1, y1, x2, y2]. Optional — defaults to the full face. */
  uv?: [number, number, number, number];
  /** Texture rotation in degrees: 0 | 90 | 180 | 270. */
  rotation?: number;
  /** Biome tint index (>= 0 means the face is tinted, e.g. grass/foliage). */
  tintindex?: number;
  /** Explicit multiply tint as sRGB [r,g,b] in 0..1 (e.g. water blue, banner
   *  dye). Takes precedence over `tintindex`; used by synthesized blocks whose
   *  texture is grayscale and colored at render time. */
  tint?: [number, number, number];
}

export interface ElementRotation {
  origin: [number, number, number];
  axis: 'x' | 'y' | 'z';
  angle: number;
  rescale?: boolean;
}

export interface ModelElement {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: ElementRotation;
  faces: Partial<Record<FaceDir, ModelFace>>;
}

/** A single renderable model with the blockstate-level rotation that applies to it. */
export interface ResolvedModel {
  elements: ModelElement[];
  x?: number;
  y?: number;
  uvlock?: boolean;
}

export interface PaletteEntry {
  name: string;
  properties?: Record<string, string>;
  /** Renderable models. Empty when the block is air or could not be resolved. */
  models: ResolvedModel[];
  /** Deterministic fallback color [r,g,b] in 0..1, used when textures are missing. */
  color: [number, number, number];
  /** True for air-like blocks that should not be rendered at all. */
  air: boolean;
}

export interface StructureBlock {
  state: number;
  pos: [number, number, number];
}

/** How a jigsaw constrains the rotation of the piece attached to it. */
export type JigsawJoint = 'rollable' | 'aligned';

/** A jigsaw block in a structure — the connection point used by worldgen to
 *  attach another piece. Parsed from the block's `orientation` property plus its
 *  block-entity NBT (`name`/`target`/`pool`/`final_state`/`joint`/priorities). */
export interface JigsawConnector {
  /** Block position within the structure's local coordinate space. */
  pos: [number, number, number];
  /** This connector's own name; a child jigsaw attaches here when its `target` matches. */
  name: string;
  /** The connector name this one wants to attach to (matched against another's `name`). */
  target: string;
  /** Template pool to pull the attached piece from (e.g. "minecraft:village/houses"). */
  pool: string;
  /** Block this jigsaw turns into after generation (usually "minecraft:air"). */
  finalState: string;
  joint: JigsawJoint;
  /** Block `orientation` property, "<front>_<top>" (e.g. "south_up", "down_east"). */
  orientation: string;
  /** Generation selection order (1.20.3+); 0 when absent. */
  selectionPriority: number;
  /** Child-placement order (1.20.3+); 0 when absent. */
  placementPriority: number;
}

export interface StructureData {
  name: string;
  path: string;
  size: [number, number, number];
  palette: PaletteEntry[];
  blocks: StructureBlock[];
  /** Unique texture keys referenced anywhere in the palette. */
  textures: string[];
  /** Whether the Minecraft content pack was found and used for resolution. */
  hasContent: boolean;
  /** Total non-air blocks. */
  blockCount: number;
  /** Jigsaw connection points found in this structure (empty when none). */
  jigsaws: JigsawConnector[];
}

/** An opened mod project whose assets augment the base content pack. */
export interface Workspace {
  /** Display name (the chosen project folder's basename). */
  name: string;
  /** Resources root that contains `assets/` and `data/` (e.g. .../src/main/resources). */
  root: string;
  /** The mod's asset namespace, e.g. "theplacebeyond". */
  namespace: string;
  /** Detected (or user-selected) Minecraft version, e.g. "1.21.1"; null when unknown. */
  minecraftVersion: string | null;
}

// --- Jigsaw assembly ---------------------------------------------------------

/** A structure placed in the assembly: which file, where, and its Y rotation.
 *  Rotation is in quarter-turns about +Y (0..3); offset is the world position of
 *  the piece's local origin (after rotation), in block units. */
export interface PlacedPiece {
  /** Stable id for this placement (root is "root"). */
  id: string;
  /** The pieces's structure id (namespace:path), for display. */
  structureId: string;
  /** Absolute path to the structure `.nbt`, so the renderer can load its meshes. */
  structurePath: string;
  offset: [number, number, number];
  quarterTurns: 0 | 1 | 2 | 3;
  /** Placement depth from the root (root = 0). */
  depth: number;
}

export type JigsawWarningKind =
  | 'missing-structure'
  | 'empty-pool'
  | 'unmatched-target'
  | 'overlap'
  | 'depth-limit'
  | 'unsupported-orientation';

/** A problem found while assembling/validating, surfaced to the user. */
export interface JigsawWarning {
  kind: JigsawWarningKind;
  message: string;
  /** Optional placement id the warning relates to. */
  pieceId?: string;
}

export interface JigsawPlan {
  pieces: PlacedPiece[];
  warnings: JigsawWarning[];
}

export interface AssembleOptions {
  /** Deterministic seed; same seed + structure ⇒ same assembly. */
  seed: number;
  /** Maximum recursion depth from the root piece. */
  maxDepth: number;
}

/** One candidate piece that could attach to a given connector (manual mode). */
export interface JigsawCandidate {
  structureId: string;
  structurePath: string;
  weight: number;
  /** The placement that would attach this candidate to the source connector. */
  placement: PlacedPiece;
}

// --- AI structure generation -------------------------------------------------

/** A reference image attached to a generation prompt. `data` is base64 with no
 *  `data:` URL prefix; `mediaType` is one Claude accepts (png/jpeg/gif/webp). */
export interface GenerateImage {
  mediaType: string;
  data: string;
}

/** Result of an AI generation/edit turn: the written `.nbt` (a temp version) and
 *  its metadata, or an error message for the UI to surface. */
export type GenerateResult =
  | {
      ok: true;
      /** Absolute path to the compiled `.nbt` version, ready to load in the viewer. */
      path: string;
      /** Monotonic version number within the session (1, 2, …). */
      version: number;
      /** The model's short note about the build (palette, features, assumptions). */
      summary: string;
      size: [number, number, number];
      blockCount: number;
      /** The SDK conversation id, so the renderer can persist it for resume. */
      sdkSessionId: string | null;
    }
  | { ok: false; error: string; canceled?: boolean };

/** One message in a document's AI chat transcript (persisted + shown in the UI). */
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  /** Reference image data URLs shown as thumbnails (user messages only). */
  images?: string[];
  meta?: { version: number; size: [number, number, number]; blockCount: number; tookMs?: number };
}

/** Persisted per-NBT chat history (main/chat-history.ts), keyed by file path (or
 *  the session id for an Untitled build). Carries the SDK session id + version so
 *  reopening a file can resume the same Claude conversation. */
export interface ChatRecord {
  sessionId: string;
  sdkSessionId: string | null;
  version: number;
  messages: ChatMessage[];
  updatedAt?: number;
}

/** Coarse phase of an in-flight generation, for the progress indicator.
 *  `rendering` = the just-emitted build is being screenshotted for review;
 *  `reviewing` = the model is comparing that render to the goal and deciding
 *  whether to refine it. */
export type GeneratePhase = 'thinking' | 'building' | 'compiling' | 'rendering' | 'reviewing';

/** Payload of IPC_EVENTS.aiRenderRequest: main asks the renderer to load a
 *  generated `.nbt` and screenshot it for the generator's self-review loop. The
 *  `sessionId` lets the renderer route the capture to the right tab — its own
 *  on-screen viewer if active, else the headless capture viewer. */
export interface RenderRequest {
  requestId: string;
  sessionId: string;
  path: string;
  version: number;
}

/** Renderer's reply to a RenderRequest (IPC_CHANNELS.aiRenderResult): the
 *  captured preview image(s), or an error string if rendering failed. */
export interface RenderResult {
  requestId: string;
  images?: GenerateImage[];
  error?: string;
}

/** Live progress pushed from main during generation (see IPC_EVENTS.aiProgress). */
export interface GenerateProgress {
  sessionId: string;
  phase: GeneratePhase;
  /** Prompt (input) tokens consumed so far, summed across turns. */
  inputTokens: number;
  /** Generated (output) tokens so far, summed across turns. */
  outputTokens: number;
  /** Assistant turns started so far. */
  turns: number;
}

/** Non-secret status of the stored Anthropic API key (the key itself never
 *  crosses the bridge). `fromEnv` means it's pinned by ANTHROPIC_API_KEY and so
 *  can't be edited in-app. */
export interface ApiKeyInfo {
  set: boolean;
  /** A masked tail like `…1a2b`, or null when no key is set. */
  hint: string | null;
  fromEnv: boolean;
}

/** The standardized panels/windows the View menu can show/hide. */
export type WindowId = 'controls' | 'inspector' | 'jigsaw' | 'generate';

/** Per-window state the renderer reports to main so the View menu reflects it.
 *  `available` gates the menu item's enabled state (its content can exist);
 *  `visible` drives the checkmark. */
export interface WindowMenuState {
  visible: boolean;
  available: boolean;
}

export type WindowsReport = Record<WindowId, WindowMenuState>;

export interface BlockwrightApi {
  platform: NodeJS.Platform;
  /** Dev-only: capture/auto-assemble config from main's env (BW_ASSEMBLE), or
   *  null. When set, the renderer auto-runs an assembly so the headless capture
   *  screenshots a full assembly instead of just the root piece. */
  captureAssemble: () => Promise<{ depth: number; seed: number } | null>;
  openDialog: () => Promise<string | null>;
  loadStructure: (path: string) => Promise<StructureData>;
  /** Build a texture URL served by the custom protocol. Key is "namespace/path". */
  textureUrl: (key: string) => string;
  hasTexture: (key: string) => Promise<boolean>;
  /** Open a mod workspace (directory picker); returns the active workspace or null. */
  openWorkspace: () => Promise<Workspace | null>;
  closeWorkspace: () => Promise<null>;
  getWorkspace: () => Promise<Workspace | null>;
  /** Minecraft version of the active content pack (its version.json), or null. */
  getContentVersion: () => Promise<string | null>;
  /** Activate a known/detected workspace; returns it, or null if it no longer exists. */
  activateWorkspace: (workspace: Workspace) => Promise<Workspace | null>;
  /** Detect whether a `.nbt` path belongs to a mod project (returns its Workspace or null). */
  detectFileWorkspace: (path: string) => Promise<Workspace | null>;
  /** Recently opened mod workspaces, most-recent first. Both return the updated list. */
  listRecentWorkspaces: () => Promise<Workspace[]>;
  clearRecentWorkspaces: () => Promise<Workspace[]>;
  /** Absolute paths of the active workspace's `.nbt` structures (empty when none). */
  listWorkspaceStructures: () => Promise<string[]>;
  /** Persist a user-chosen Minecraft version for the active workspace; returns it. */
  setWorkspaceVersion: (version: string) => Promise<Workspace | null>;
  /** Plan a full jigsaw assembly starting from a structure file. */
  assembleJigsaw: (path: string, options: AssembleOptions) => Promise<JigsawPlan>;
  /** Candidate pieces that can attach to one connector of a structure (manual mode). */
  jigsawCandidates: (path: string, connectorIndex: number) => Promise<JigsawCandidate[]>;
  /** Whether an Anthropic API key is configured (gates the AI generation UI). */
  aiAvailable: () => Promise<boolean>;
  /** Non-secret status of the stored API key (for the Settings panel). */
  aiKeyInfo: () => Promise<ApiKeyInfo>;
  /** Store the Anthropic API key (encrypted, in the main process); returns its new status. */
  aiSetKey: (key: string) => Promise<ApiKeyInfo>;
  /** Remove the stored Anthropic API key; returns its new status. */
  aiClearKey: () => Promise<ApiKeyInfo>;
  /** Generate or edit a structure for a session; returns the written `.nbt` or an error.
   *  Optional reference images are sent to the model as visual guidance. `basePath` is
   *  the `.nbt` currently open in the viewer; on a fresh session it seeds the model with
   *  that structure so the first prompt edits it instead of building from scratch. */
  aiGenerate: (sessionId: string, prompt: string, images?: GenerateImage[], basePath?: string) => Promise<GenerateResult>;
  /** Cancel the in-flight generation for a session (resolves the pending aiGenerate as canceled). */
  aiCancel: (sessionId: string) => Promise<void>;
  /** Forget a generation session's conversation so the next prompt starts fresh. */
  aiResetSession: (sessionId: string) => Promise<void>;
  /** Restore a session's SDK conversation id + version from persisted history so a
   *  follow-up after restart resumes the same Claude conversation. */
  aiPrimeSession: (sessionId: string, sdkSessionId: string | null, version: number) => Promise<void>;
  /** Load persisted chat history for a key (a file path, or a session id), or null. */
  chatHistoryGet: (key: string) => Promise<ChatRecord | null>;
  /** Persist chat history for a key (debounced by the caller). */
  chatHistorySave: (key: string, record: ChatRecord) => Promise<void>;
  /** Notified with live token/phase progress while a generation is in flight. */
  onAiProgress: (cb: (progress: GenerateProgress) => void) => void;
  /** Notified when main wants the just-generated `.nbt` rendered + screenshotted
   *  for the generator's self-review loop. The handler should load the structure,
   *  capture it, and reply via `sendRenderResult`. */
  onAiRenderRequest: (cb: (req: RenderRequest) => void) => void;
  /** Reply to an onAiRenderRequest with the captured image(s) or an error. */
  sendRenderResult: (result: RenderResult) => void;
  /** Report whether a structure is currently open, so main can enable/disable Close File. */
  setFileOpen: (open: boolean) => void;
  /** Report the floating-window state so the View menu's checkmarks/enabled state track it. */
  reportWindows: (state: WindowsReport) => void;
  /** Whether a path still exists on disk (used to validate recents before opening). */
  pathExists: (path: string) => Promise<boolean>;
  /** Recently opened files, most-recent first. All return the updated list. */
  listRecents: () => Promise<string[]>;
  addRecent: (path: string) => Promise<string[]>;
  removeRecent: (path: string) => Promise<string[]>;
  clearRecents: () => Promise<string[]>;
  onOpenPath: (cb: (path: string) => void) => void;
  onFileDrop: (cb: (path: string) => void) => void;
  /** Notified when the recents list changes in main (e.g. via the native menu). */
  onRecentsChanged: (cb: (paths: string[]) => void) => void;
  /** Notified when the active mod workspace changes (opened or closed). */
  onWorkspaceChanged: (cb: (workspace: Workspace | null) => void) => void;
  /** Notified when the recent-workspaces list changes. */
  onRecentWorkspacesChanged: (cb: (workspaces: Workspace[]) => void) => void;
  /** Notified when main requests closing the current structure (native File menu). */
  onCloseStructure: (cb: () => void) => void;
  /** Notified when main requests opening the Settings panel (native menu / Cmd+,). */
  onOpenSettings: (cb: () => void) => void;
  /** Notified when the View menu toggles a floating window's visibility. */
  onToggleWindow: (cb: (id: WindowId) => void) => void;
  /** Notified when the View ▸ Layout menu requests resetting window positions. */
  onResetWindows: (cb: () => void) => void;
  /** Notified when File ▸ New Structure is chosen (opens the AI generation panel). */
  onNewStructure: (cb: () => void) => void;
}

declare global {
  interface Window {
    blockwright: BlockwrightApi;
  }
}
