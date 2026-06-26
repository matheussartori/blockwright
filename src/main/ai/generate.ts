// AI structure generation orchestrator. Provider-agnostic: it owns sessions, the
// revision budget, and the live progress accounting, and wires the per-emit handler
// (createEmitHandler — the emit→compile→render→review step, in emit-handler.ts), then
// dispatches the LLM transport to the active provider's driver (see providers/). Drivers
// differ only in how they run a tool-using, multi-turn, streaming conversation.
//
// Both backends are SUBSCRIPTION-based (an existing CLI login, no API credits): the
// Claude Agent SDK (Pro/Max) and the Codex CLI (ChatGPT Plus/Pro). The user picks the
// active provider + model in Settings (see credentials.ts).
import type { GenerateResult, GenerateProgress, GenerateImage, BuildSelection, FloorDef } from '@/shared/types';
import { systemPrompt } from './schema';
import { modBlockGuide } from '../structure/assets/block-dictionary';
import { phaseAt, PHASES } from './phases';
import { maxRoundsFor } from './rounds';
import path from 'node:path';
import { beginRun, endRun, getSession } from './session';
import { buildSeed, seedFromFile } from './seed';
import { buildShellSeed } from './shell-seed';
import { activeCredential, aiAvailable, getGenerationSettings } from './credentials';
import { getCritic, getDriver, RESUMABLE_PROVIDERS } from './providers';
import { RunLog } from './gen-log';
import { TokenMeter, type TokenTotals } from './token-meter';
import type { DriverProgress } from './providers/types';
import type { ShellLockCell } from '../structure/authoring';
import { createEmitHandler, type CapturePreview, type EmitRunState } from './emit-handler';

export type { CapturePreview };

/** A numeric env override (e.g. BW_AI_MAX_ROUNDS), or null when unset/blank —
 *  power-user escape hatch that wins over the persisted Settings ▸ AI knobs. */
function envNum(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export { aiAvailable };
// Session lifecycle + the edit-seed live in their own modules; re-export the
// IPC-facing pieces so importers (ipc.ts) stay stable.
export { cancelGeneration, listVersions, primeSession, resetSession } from './session';

/** Everything a generation/edit turn needs. Bundled as one options object (rather than
 *  a long positional list) so callers and drivers stay readable as the run grows. */
export interface GenerateStructureOptions {
  /** The AI session id (one per chat tab) whose scratch dir + version this run writes. */
  sessionId: string;
  /** The full prompt sent to the model (user words + composer brief + floor plan). */
  prompt: string;
  /** Optional reference images sent as visual guidance. */
  images?: GenerateImage[];
  /** The structured module selection (drives which knowledge guides load). */
  selection?: BuildSelection;
  /** Live token/phase callback, called as the model works. */
  onProgress?: (p: GenerateProgress) => void;
  /** Renders a just-emitted version and returns screenshots for the model to review. */
  capture?: CapturePreview;
  /** The `.nbt` currently open in the viewer; on a fresh session it seeds the model so
   *  the first prompt edits that structure rather than starting over. */
  basePath?: string;
  /** The user's Floor plan (UI), overriding the storeys the model declares for grade. */
  floors?: FloorDef[];
}

/**
 * Generate (or edit) the structure for a session from a prompt, running the
 * emit → compile → render → review loop until the model is satisfied, the round
 * budget is spent, or the run is cancelled.
 *
 * @param opts - The run inputs (see {@link GenerateStructureOptions}).
 * @returns The written `.nbt` path + metadata on success, or an error message
 *   (with `canceled` set when the user aborted) for the UI to surface.
 */
export async function generateStructure(opts: GenerateStructureOptions): Promise<GenerateResult> {
  const { sessionId, prompt, images, selection, onProgress, capture, basePath, floors } = opts;
  const session = getSession(sessionId);
  // Tees the AI/fix play-by-play to the Console dock AND (once the library folder is
  // reserved on the first emit) to that build's `generation.log`.
  const run = new RunLog();
  const cred = activeCredential();
  const resumable = RESUMABLE_PROVIDERS.has(cred.id);
  // The user's cost/quality knobs (Settings ▸ AI), defaulting CHEAP; a BW_AI_* env
  // var still wins for power users.
  const gen = getGenerationSettings();
  const thinkingBudget = envNum('BW_AI_THINKING_BUDGET') ?? gen.thinkingBudget;
  // A numeric budget (env or a positive `maxRounds` setting) is the authoritative cap;
  // `maxRounds:0` (Balanced) is the AUTO sentinel → null → volume-scaled (see below).
  const roundsBudget = envNum('BW_AI_MAX_ROUNDS') ?? (gen.maxRounds > 0 ? gen.maxRounds : null);
  // Independent critic for the audit gate — only when the user enabled it AND the
  // provider has one (null → the gate falls back to the model's self-reported audit).
  const critic = gen.critic ? await getCritic(cred.id) : null;

  // A fresh build of a shell-seeded archetype (the modern villa) starts from its
  // code-built exterior shell, so the model finishes a guaranteed-modern silhouette
  // instead of inventing one (and reliably reverting to a pitched box). Falls through
  // to the normal edit/free-form seed for every other case.
  // The LOCKED shell cells of a seeded archetype: re-asserted on every emit's compile
  // so the AI can't gut the code-built exterior (it reliably emits furniture-only
  // deltas otherwise). Empty for a free-form build (so `preserveShell` no-ops).
  // A REBASE: the user promoted an OLDER version to "Current" and is generating from
  // it (basePath points at a `v{k}.nbt` in our scratch dir with k < the latest). Branch
  // a fresh conversation from that build — forget the server-side session so the model
  // restarts from the promoted version, and seed from its file directly.
  const baseVersion = sessionVersionOf(basePath, session.dir);
  const rebasing = baseVersion != null && baseVersion < session.version;
  let lockCells: ShellLockCell[] | undefined;
  let seed: string;
  if (rebasing && basePath) {
    session.sdkSessionId = null;
    seed = await seedFromFile(basePath);
  } else {
    seed = await buildSeed(resumable, session, basePath);
  }
  if (!seed && session.version === 0) {
    const shell = await buildShellSeed({
      structureType: selection?.structureType,
      decoration: selection?.decoration,
      size: selection?.size,
      roof: selection?.roof,
      basement: selection?.basement,
      basementHeights: selection?.basementHeights,
      basementArea: selection?.basementArea,
      shellSize: selection?.shellSize,
      surroundings: selection?.surroundings,
      surroundSizing: selection?.surroundSizing,
      floorHeights: selection?.floorHeights,
      floors: selection?.floorHeights?.length,
    }, session.dir);
    seed = shell.preamble;
    lockCells = shell.lockCells;
  }
  const effectivePrompt = seed + prompt;

  // ONE version per run: allocate the number now, before any emit, so every design
  // pass overwrites the same `v{runVersion}.nbt` instead of stacking a near-identical
  // version per pass. session.version is bumped to it on the first successful emit, so
  // the next prompt (a new run) increments from here.
  const runVersion = session.version + 1;

  run.ai(
    `Starting generation with the “${cred.id}” provider (${cred.model})` +
      `${critic ? ', independent critic enabled' : ''}. ` +
      `The model will plan, emit geometry, then refine over the design passes.`,
  );

  const startedAt = Date.now();
  // The run state shared by the progress callback, the emit handler, and the post-run
  // result assembly (see EmitRunState). `emitted.value` is BOXED so the closures can
  // assign it where the main body's flow analysis can't see (a bare `let` would stay
  // typed `null` below, narrowing the truthy branch to `never`). The round budget: a
  // numeric `maxRounds` knob is honored down to 1; the AUTO path (roundsBudget null)
  // floors to the full design-pass sequence and is recomputed from the build volume on
  // the first emit. `phaseIndex` walks the design passes (massing → … → audit), one per
  // emit, clamped at the terminal audit pass — owned here so it works on every provider.
  const state: EmitRunState = {
    phase: 'thinking',
    phaseIndex: 0,
    rounds: 0,
    maxRounds: maxRoundsFor(0, roundsBudget),
    turns: 0,
    captureError: null,
    emitted: { value: null },
  };

  // Live progress accounting. The TokenMeter owns the token math (input across turns,
  // the committed + running-estimate output blend); `state` keeps the phase, turn count
  // and design pointer the snapshot reads.
  const meter = new TokenMeter();
  let lastEmit = 0;
  let lastSnapshot = '';
  const emitProgress = (force = false): void => {
    if (!onProgress) return;
    const snapshot = `${state.phase}:${state.phaseIndex}:${meter.inputTokens}:${meter.displayedOutput()}:${state.turns}`;
    const now = Date.now();
    if (!force && (snapshot === lastSnapshot || now - lastEmit < 150)) return;
    lastSnapshot = snapshot;
    lastEmit = now;
    const dp = phaseAt(state.phaseIndex);
    onProgress({
      sessionId, phase: state.phase, inputTokens: meter.inputTokens, outputTokens: meter.displayedOutput(), turns: state.turns,
      designPhase: dp.id, designStep: state.phaseIndex + 1, designSteps: PHASES.length,
    });
  };
  emitProgress(true); // flip the UI to a live status immediately

  const progress: DriverProgress = {
    startTurn() {
      meter.startTurn();
      state.turns += 1;
      state.phase = 'thinking';
      run.ai(`Turn ${state.turns}: the model is thinking through the geometry…`);
      emitProgress();
    },
    addInput(tokens) {
      meter.addInput(tokens);
      emitProgress();
    },
    thinkingTokens(tokens) {
      meter.setThinking(tokens);
      emitProgress();
    },
    toolStarted() {
      state.phase = 'building';
      run.ai('The model is writing the structure (emitting volumetric ops & blocks)…');
      emitProgress(true);
    },
    outputChars(totalChars) {
      meter.addOutputChars(totalChars);
      emitProgress();
    },
    outputTokens(tokens) {
      meter.setOutputTokens(tokens);
      emitProgress();
    },
    endTurn() {
      meter.endTurn();
    },
  };

  // The per-emit handler (validate → compile → mirror → render → review) lives in its
  // own module; it ADVANCES the shared `state` each emit. `ac` is both its abort signal
  // and the run handle, so begin the run before wiring the handler.
  const ac = beginRun(sessionId);
  const onEmit = createEmitHandler({
    session, prompt, selection, floors, images, capture, lockCells, critic, cred,
    basePath, runVersion, abort: ac, roundsBudget, startedAt, run, meter, state, emitProgress,
  });

  // Snapshot the running token totals — attached to EVERY result branch (success,
  // cancel, error) so the chat footer can always report the cost.
  const tokens = (): TokenTotals => meter.totals();

  let driverResult: { resultSubtype?: string | null };
  try {
    const driver = await getDriver(cred.id);
    driverResult = await driver({
      credential: cred,
      // The base instructions + knowledge base, then (when a mod workspace is open and its
      // scope isn't off) the mod's annotated blocks — so the model can build with non-vanilla
      // blocks it has never seen. Empty for a vanilla run, so it costs nothing.
      systemPrompt: systemPrompt(prompt, selection) + modBlockGuide(),
      userText: effectivePrompt,
      images: images ?? [],
      thinkingBudget,
      abort: ac,
      resume: session.sdkSessionId,
      setSessionId: (id) => {
        session.sdkSessionId = id;
        if (state.emitted.value) state.emitted.value.sdkSessionId = id;
      },
      dir: session.dir,
      progress,
      onEmit,
    });
  } catch (err) {
    if (ac.signal.aborted) return { ok: false, error: 'Canceled.', canceled: true, ...tokens() };
    return { ok: false, error: authHint(errMessage(err)), ...tokens() };
  } finally {
    endRun(sessionId, ac);
  }

  // Run summary (Console dock + dev terminal): the before/after baseline for efficiency work.
  run.ai(
    `Generation finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ${state.rounds} rounds · ${state.turns} turns · ` +
      `in=${meter.inputTokens} out=${meter.displayedOutput()} tokens.`,
  );

  // Stamp the final token totals onto the emitted result (the box read keeps its
  // proper type, so this is a plain spread — see the `state.emitted` declaration above).
  if (state.emitted.value) return { ...state.emitted.value, ...tokens() };
  if (state.captureError) return { ok: false, error: state.captureError, ...tokens() };
  if (ac.signal.aborted) return { ok: false, error: 'Canceled.', canceled: true, ...tokens() };
  const subtype = driverResult.resultSubtype;
  if (subtype && subtype !== 'success') {
    return { ok: false, error: authHint(`Generation failed (${subtype}).`), ...tokens() };
  }
  return { ok: false, error: 'The model did not return a structure. Try rephrasing your request.', ...tokens() };
}

/** The version number if `p` is a `v{n}.nbt` inside this session's scratch dir, else
 *  null — used to detect a rebase (a promoted older version as the edit base). */
function sessionVersionOf(p: string | undefined, dir: string): number | null {
  if (!p) return null;
  const resolved = path.resolve(p);
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) return null;
  const m = /^v(\d+)\.nbt$/i.exec(path.basename(resolved));
  return m ? Number(m[1]) : null;
}

/** Append a hint about auth when the failure looks credential-related. */
function authHint(message: string): string {
  if (/auth|login|401|403|credential|token|unauthor|forbidden|api key|api_key/i.test(message)) {
    return `${message}\n\nThis looks like an authentication problem. Check the active AI provider's credential in Settings ▸ AI (for a subscription provider, sign in via its CLI; for an API provider, add a valid key).`;
  }
  return message;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
