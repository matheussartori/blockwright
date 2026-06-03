// The contract between the generation orchestrator (generate.ts) and a provider
// driver. The orchestrator owns everything provider-agnostic — sessions, the
// emit→compile→render→review handler, round budgeting, and progress accounting —
// and hands the driver only the LLM transport: run a tool-using, multi-turn,
// streaming conversation with a system prompt + reference images, calling `onEmit`
// each time the model emits a structure, and feeding `onEmit`'s result (text +
// screenshots) back so the model can review and refine. The driver ends when the
// model stops, `onEmit` returns `stop`, or the run is aborted.
import type { GenerateImage } from '@/shared/types';
import type { ResolvedCredential } from '../credentials';
import type { EmitArgs } from '../schema';

/** A provider-neutral content block fed back to the model as a tool result. */
export type NeutralBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mediaType: string };

/** What the shared emit handler returns for the model's review. */
export interface EmitToolResult {
  /** Blocks to return to the model: a status line, the reference (if any), and
   *  the rendered screenshots of the just-built version. */
  content: NeutralBlock[];
  /** The emit was rejected (invalid / unknown blocks) — the model must correct. */
  isError: boolean;
  /** The revision cap was reached — the driver must end without another emit. */
  stop: boolean;
}

/** Hooks the driver calls so the orchestrator can keep the live token/phase
 *  readout accurate. All are best-effort; a driver supplies what its SDK exposes. */
export interface DriverProgress {
  /** A new assistant turn begins (reflected as the "thinking" phase). */
  startTurn(): void;
  /** Add input/prompt tokens (cumulative across turns; include cached context). */
  addInput(tokens: number): void;
  /** Live thinking-token estimate for the current turn. */
  thinkingTokens(tokens: number): void;
  /** The model started calling the emit tool (reflected as the "building" phase). */
  toolStarted(): void;
  /** Running estimate of output produced this turn, from streamed characters. */
  outputChars(totalCharsThisTurn: number): void;
  /** Exact output-token count for the current turn (when the SDK reports it). */
  outputTokens(tokensThisTurn: number): void;
  /** The current turn finished — commit its output into the running total. */
  endTurn(): void;
}

export interface DriverParams {
  /** Resolved credential + model for the active provider. */
  credential: ResolvedCredential;
  /** Full system prompt (instructions + knowledge base). */
  systemPrompt: string;
  /** The user's request text (already seeded with any open-file preamble). */
  userText: string;
  /** Reference images supplied by the user (base64, no data: prefix). */
  images: GenerateImage[];
  /** Extended-thinking budget in tokens (0 disables). */
  thinkingBudget: number;
  /** Cancellation for the whole run. */
  abort: AbortController;
  /** Conversation id to resume (Claude SDK / Codex), or null to start fresh. */
  resume: string | null;
  /** Persist the provider's conversation id so a later turn can resume it. */
  setSessionId: (id: string) => void;
  /** Per-session scratch dir (for providers that round-trip images via files). */
  dir: string;
  progress: DriverProgress;
  /** Invoked each time the model emits a structure; returns the review result. */
  onEmit: (args: EmitArgs) => Promise<EmitToolResult>;
}

export interface DriverResult {
  /** A coarse outcome from the provider (e.g. "success", "error_max_turns"),
   *  used only to phrase a fallback error when no structure was produced. */
  resultSubtype?: string | null;
}

export type Driver = (p: DriverParams) => Promise<DriverResult>;
