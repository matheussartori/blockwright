// AI structure-generation contracts: the prompt inputs, the per-turn result, the
// persisted chat transcript, and the live progress / self-review render round-trip.

/** A reference image attached to a generation prompt. `data` is base64 with no
 *  `data:` URL prefix; `mediaType` is one Claude accepts (png/jpeg/gif/webp). */
export interface GenerateImage {
  mediaType: string;
  data: string;
}

/** The modules the user picked in the composer Details: a structure type, a
 *  decoration, and (for the structure) a roof + basement typology. Threaded into
 *  generation as STRUCTURED data — separate from the prompt text — so the system prompt
 *  loads only the selected modules' knowledge guides (one guide per selected module, so
 *  an unused roof/basement guide is never sent). */
export interface BuildSelection {
  structureType?: string;
  decoration?: string;
  roof?: string;
  basement?: string;
  /** In-roof attic module id (storage/bedroom), if picked — loads its own guide. Only on
   *  pitched-roof houses (it clashes with the flat roof). */
  attic?: string;
  /** Exterior finishing style id (farmhouse/sakura/gothic), if picked — loads its own
   *  guide. Only on the pitched houses (classic/cabin/l-shaped). */
  exterior?: string;
  /** Interior room module ids assigned across floors (deduped) — each loads its own
   *  knowledge guide. The per-floor layout itself rides in the prompt text. */
  rooms?: string[];
  /** The build box [W, H, D] the user picked in Details. Threaded so a structure type
   *  that ships a code-built starting SHELL (e.g. the modern house) can compile that
   *  shell at the right size and seed the model with it. */
  size?: [number, number, number];
}

/** A display-ready build card shown in the chat. On the USER message it summarises
 *  the details the user picked (a preview of the request); on the ASSISTANT message
 *  of a finished build it's the COMPLETE card — the request plus the result (version,
 *  block count) and Open/Reveal actions for the saved library file. All module fields
 *  are human LABELS, so the card renders without any catalog lookup. */
export interface BuildBrief {
  /** Structure-type label, or undefined for a plain free-form prompt with no Details. */
  structure?: string;
  decoration?: string;
  roof?: string;
  basement?: string;
  /** In-roof attic label (Storage/Bedroom), if picked. */
  attic?: string;
  /** Exterior finishing style label (Farmhouse/Sakura/Gothic), if picked. */
  exterior?: string;
  /** Build box as [W, H, D]. */
  size?: [number, number, number];
  /** Per-floor room assignment (bottom-up): each floor's label + its room labels (0–2). */
  floors?: { name: string; rooms: string[] }[];
  /** The user's request text (assistant result card) — shown so the card is
   *  self-contained even for a details-only build with an empty chat bubble. */
  prompt?: string;
  /** Compiled version number of the finished build (assistant result card). */
  version?: number;
  /** Block count of the finished build (assistant result card). */
  blockCount?: number;
  /** Absolute path to the saved library `.nbt` (the build's latest), driving the
   *  card's Reveal-in-folder action (assistant result card). The build's own tab is
   *  already this file, so there is no "Open". */
  libraryPath?: string;
}

/** Result of an AI generation/edit turn: the written `.nbt` (a temp version) and
 *  its metadata, or an error message for the UI to surface. */
export type GenerateResult =
  | {
      ok: true;
      /** Absolute path to the compiled `.nbt` version, ready to load in the viewer. */
      path: string;
      /** Absolute path to the saved library file (`<dir>/<slug>.nbt`, the build's
       *  latest), for the chat card's Open action. Null if the mirror failed. */
      libraryPath: string | null;
      /** Monotonic version number within the session (1, 2, …). */
      version: number;
      /** The model's short note about the build (palette, features, assumptions). */
      summary: string;
      size: [number, number, number];
      blockCount: number;
      /** The SDK conversation id, so the renderer can persist it for resume. */
      sdkSessionId: string | null;
      /** Prompt (input) tokens consumed across the whole turn, incl. cached context. */
      tokensIn: number;
      /** Generated (output) tokens across the whole turn. */
      tokensOut: number;
    }
  | { ok: false; error: string; canceled?: boolean; tokensIn?: number; tokensOut?: number };

/** A compiled version of a generation session, living on disk as `vN.nbt`. The
 *  Versions panel lists these so the user can flip between earlier builds for
 *  viewing (editing always continues from the latest). */
export interface VersionInfo {
  /** Monotonic version number within the session (1, 2, …). */
  version: number;
  /** Absolute path to the compiled `vN.nbt`, loadable in the viewer. */
  path: string;
}

/** One message in a document's AI chat transcript (persisted + shown in the UI). */
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  /** Reference image data URLs shown as thumbnails (user messages only). */
  images?: string[];
  /** Structured build details the user picked (user messages only), rendered as a
   *  presentable card in the chat instead of the raw "[Build details]" prompt text. */
  build?: BuildBrief;
  /** Footer stats shown under an assistant message. Present on every completed
   *  turn — success, cancel, or error — so the run's time/token cost is never
   *  hidden. Build fields (version/size/blockCount) only exist on a successful emit. */
  meta?: {
    version?: number;
    size?: [number, number, number];
    blockCount?: number;
    /** Wall-clock duration of the turn (ms). */
    tookMs?: number;
    /** Prompt (input) tokens consumed this turn. */
    tokensIn?: number;
    /** Generated (output) tokens this turn. */
    tokensOut?: number;
  };
}

/** What a storey IS, used to locate the ground-floor level ("grade"): the boundary
 *  between below-grade exterior (kept as structure_void so placement preserves the
 *  surrounding terrain) and at/above-grade exterior (cleared to air so the facade /
 *  balcony stay visible and walkable). `basement` is below grade; everything else is
 *  at/above it. See `gradeFromFloors` in the authoring compiler. */
export type FloorRole = 'basement' | 'ground' | 'upper' | 'roof';

/** A named vertical level the user defined for a generated build, used as context
 *  for the AI (so "the basement" / "the top floor" map to concrete y ranges) and
 *  highlighted as a region in the viewer. The level spans the inclusive y range
 *  `from`..`to` (Minecraft is Y-up; y=0 is the lowest layer). The optional `role`
 *  marks below-grade storeys so the air-fill keeps the basement surround as terrain. */
export interface FloorDef {
  id: string;
  name: string;
  from: number;
  to: number;
  role?: FloorRole;
}

/** Persisted per-NBT chat history (main/chat-history.ts), keyed by file path (or
 *  the session id for an Untitled build). Carries the SDK session id + version so
 *  reopening a file can resume the same Claude conversation. */
export interface ChatRecord {
  sessionId: string;
  sdkSessionId: string | null;
  version: number;
  messages: ChatMessage[];
  /** Overrides the file path as the version chain's "Original" baseline — set
   *  when the build was flattened via "Clear versions" so the iterated build,
   *  not the untouched on-disk file, is the v0. Absent = use the file path. */
  baselinePath?: string | null;
  /** Named vertical levels the user defined for this build (the "floor plan");
   *  folded into every AI prompt as context. Absent = none defined. */
  floors?: FloorDef[];
  /** True when this record belongs to a from-scratch AI build whose `filePath` is
   *  its own saved library `.nbt` (the generated output, not an "Original"), so the
   *  version chain skips the v0 baseline on reopen. Absent = a normal opened file. */
  generated?: boolean;
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
  /** Current design pass id (massing/roof/facade/…), for the phased review loop;
   *  the renderer maps it to a localized label. */
  designPhase?: string;
  /** 1-based index + total of the design passes (e.g. step 3 of 6). */
  designStep?: number;
  designSteps?: number;
}
