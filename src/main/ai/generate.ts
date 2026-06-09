// AI structure generation orchestrator. Provider-agnostic: it owns sessions, the
// emit→compile→render→review handler, the revision budget, and the live progress
// accounting, then dispatches the LLM transport to the active provider's driver
// (see providers/). Drivers differ only in how they run a tool-using, multi-turn,
// streaming conversation; the build/validate/render logic below is shared.
//
// Generation can run on a subscription (Claude Code / Codex — no API credits) or
// a paid API key (Anthropic / OpenAI / Gemini); the user picks the active
// provider + model in Settings (see credentials.ts).
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { GenerateResult, GenerateProgress, GeneratePhase, GenerateImage, BuildSelection, FloorDef } from '@/shared/types';
import { systemPrompt } from './schema';
import type { EmitArgs } from './schema';
import { advancePhase, AUDIT_CHECKS, auditChecklistText, isLastPhase, phaseAt, PHASES, summarizeAudit } from './phases';
import { auditGateFeedback } from './audit-gate';
import { maxRoundsFor } from './rounds';
import { beginRun, endRun, getSession } from './session';
import { mirrorToLibrary } from './output-dir';
import { buildMetadata, librarySidecarPath, removeTempMetadata, writeMetadataJson } from '../structure/metadata';
import { structureFloorPlan } from '../structure/domain';
import { mergePatch } from './patch';
import { validateEmit } from './emit-validate';
import { buildSeed } from './seed';
import { buildShellSeed } from './shell-seed';
import { activeCredential, aiAvailable } from './credentials';
import { getCritic, getDriver, RESUMABLE_PROVIDERS } from './providers';
import { RunLog } from './gen-log';
import { buildReviewContent } from './review-content';
import { TokenMeter, type TokenTotals } from './token-meter';
import type { DriverProgress, EmitToolResult } from './providers/types';
import { writeStructureFile, resolveBlocks, type AuthoringStructure, type CompileReport } from '../structure/authoring';

/** Render a just-emitted version and return screenshot(s) of it (or an error),
 *  so the model can see its own build and refine it. Supplied by the IPC layer,
 *  which round-trips to the renderer (main can't render the Three.js scene). */
export type CapturePreview = (
  path: string,
  version: number,
) => Promise<{ images?: GenerateImage[]; error?: string }>;

/** Extended thinking budget (tokens). Spatial builds need real planning — roofs
 *  and massing come out boxy/broken without it — so we enable it by default.
 *  Set BW_AI_THINKING_BUDGET=0 to disable, or a token count to tune the budget. */
const THINKING_BUDGET = process.env.BW_AI_THINKING_BUDGET !== undefined
  ? Number(process.env.BW_AI_THINKING_BUDGET)
  : 5000;

/** Max emit→render→review rounds before we force the model to stop, so the
 *  self-correction loop can't run forever. When BW_AI_MAX_ROUNDS is unset we pick
 *  the cap per-build from its volume; the env override, when present, wins. */
const ENV_MAX_ROUNDS = process.env.BW_AI_MAX_ROUNDS ? Number(process.env.BW_AI_MAX_ROUNDS) : null;

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
  // Independent critic for the audit gate (null on providers without one → the gate
  // falls back to the model's self-reported audit).
  const critic = await getCritic(cred.id);

  // A fresh build of a shell-seeded archetype (the modern villa) starts from its
  // code-built exterior shell, so the model finishes a guaranteed-modern silhouette
  // instead of inventing one (and reliably reverting to a pitched box). Falls through
  // to the normal edit/free-form seed for every other case.
  let seed = await buildSeed(resumable, session, basePath);
  if (!seed && session.version === 0) {
    seed = await buildShellSeed(selection?.structureType, selection?.decoration, selection?.size, session.dir, selection?.roof);
  }
  const effectivePrompt = seed + prompt;

  run.ai(
    `Starting generation with the “${cred.id}” provider (${cred.model})` +
      `${critic ? ', independent critic enabled' : ''}. ` +
      `The model will plan, emit geometry, then refine over the design passes.`,
  );

  // The successful result, captured by the emit handler as the model emits the
  // structure. BOXED (a mutable holder) rather than a bare `let`: it's assigned only
  // inside the onEmit/setSessionId closures, which the main body's flow analysis can't
  // see — a bare `let` would still be typed `null` below (narrowing the truthy branch
  // to `never`). Reading `emitted.value` keeps the proper `CapturedOk | null` type.
  type CapturedOk = Extract<GenerateResult, { ok: true }>;
  const emitted: { value: CapturedOk | null } = { value: null };
  let captureError: string | null = null;
  const startedAt = Date.now();
  let rounds = 0;
  // Volume is unknown until the first emit, so start at the floor; re-derived from
  // the build's size on round 1 below.
  let maxRounds = maxRoundsFor(0, ENV_MAX_ROUNDS);
  // The design pass the model should be working on this emit (massing → … → audit).
  // The orchestrator owns this pointer; it advances one pass per emit (clamped at
  // the terminal audit pass) regardless of provider.
  let phaseIndex = 0;

  // Live progress accounting. The TokenMeter owns the token math (input across turns,
  // the committed + running-estimate output blend); the orchestrator keeps the phase,
  // turn count and emit cadence here.
  const meter = new TokenMeter();
  let turns = 0;
  let phase: GeneratePhase = 'thinking';
  let lastEmit = 0;
  let lastSnapshot = '';
  const emitProgress = (force = false): void => {
    if (!onProgress) return;
    const snapshot = `${phase}:${phaseIndex}:${meter.inputTokens}:${meter.displayedOutput()}:${turns}`;
    const now = Date.now();
    if (!force && (snapshot === lastSnapshot || now - lastEmit < 150)) return;
    lastSnapshot = snapshot;
    lastEmit = now;
    const dp = phaseAt(phaseIndex);
    onProgress({
      sessionId, phase, inputTokens: meter.inputTokens, outputTokens: meter.displayedOutput(), turns,
      designPhase: dp.id, designStep: phaseIndex + 1, designSteps: PHASES.length,
    });
  };
  emitProgress(true); // flip the UI to a live status immediately

  const progress: DriverProgress = {
    startTurn() {
      meter.startTurn();
      turns += 1;
      phase = 'thinking';
      run.ai(`Turn ${turns}: the model is thinking through the geometry…`);
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
      phase = 'building';
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

  // The shared emit handler: validate → compile → write → render → review. Returns
  // the content blocks (status + screenshots) for the model and a `stop` flag once
  // the revision budget is spent. Drivers call this each time the model emits.
  const onEmit = async (args: EmitArgs): Promise<EmitToolResult> => {
    const text = (t: string, isError = false): EmitToolResult => ({ content: [{ type: 'text', text: t }], isError, stop: false });
    phase = 'compiling';
    emitProgress(true);
    run.ai(
      `The model emitted a ${args.mode === 'patch' ? 'patch' : 'full'} structure for the ` +
        `“${phaseAt(phaseIndex).label}” pass — validating and compiling it.`,
    );

    // A patch reuses the previous version as its base and appends new geometry
    // (palette entries are append-only; later ops overwrite earlier cells). Falls
    // back to treating it as a full emit when there's no prior version.
    const input = args.structure;
    let authoring = input;
    if (args.mode === 'patch' && session.version >= 1) {
      try {
        const prevJson = await fsp.readFile(path.join(session.dir, `v${session.version}.json`), 'utf8');
        authoring = mergePatch(JSON.parse(prevJson) as AuthoringStructure, input);
      } catch (err) {
        captureError = `Could not load the previous version to patch: ${errMessage(err)}`;
        return text(`${captureError}. Re-emit a COMPLETE structure with mode "full".`, true);
      }
    }

    // Pre-compile gates: structurally valid, no minecraft:light, only real block ids.
    const rejection = validateEmit(authoring);
    if (rejection) {
      captureError = rejection.reason;
      return text(rejection.feedback, true);
    }

    const version = session.version + 1;
    const nbtPath = path.join(session.dir, `v${version}.nbt`);
    let report: CompileReport;
    try {
      run.fix('Compiling to .nbt and running the code fix-up passes over the build:');
      // Thread the selected structure type so the compile runs that structure's
      // declared finalize passes (e.g. the house's single-chimney + stair-inset fixes).
      // `log` streams each pass's play-by-play into the Console dock (fix-tagged).
      report = await writeStructureFile(authoring, nbtPath, {
        structureType: selection?.structureType,
        // The user's Floor plan (UI) overrides the model's declared storeys for grade.
        floors: floors?.length ? floors : undefined,
        log: run.fix,
      });
      await fsp.writeFile(path.join(session.dir, `v${version}.json`), JSON.stringify(authoring, null, 2));
    } catch (err) {
      captureError = `Failed to compile the structure: ${errMessage(err)}`;
      return text(captureError, true);
    }

    session.version = version;

    run.fix(
      report.fixes.length || report.warnings.length
        ? `Fine-tuning complete: ${report.fixes.length} auto-fix(es), ${report.warnings.length} warning(s) left for the model.`
        : 'Fine-tuning complete: the build needed no code corrections.',
    );

    // Mirror this version into the user's library FOLDER (`<slug>/`) — reserved once
    // per session from the first prompt: the kept `versions/vN.nbt` plus the latest
    // clean `<slug>.nbt` (best-effort; the scratch `vN.nbt` is the source). Once the
    // folder exists, tee the AI/fix log into its `generation.log`.
    session.library = await mirrorToLibrary(session.library, prompt, nbtPath, version);
    if (session.library.dir) run.attach(session.library.dir);

    const size = (authoring.size ?? [0, 0, 0]) as [number, number, number];
    const resolved = resolveBlocks(authoring);
    const blockCount = resolved.blocks.length;

    // Write/refresh the `.bw.json` sidecar beside the library build, so a later edit
    // has the size, dominant palette and recognised storeys to work from. Storeys come
    // from (in priority): the user's Floor plan > the AUTHORITATIVE plan of the code-built
    // structure type (tied to the shell, so a flat-roofed modern villa is labelled exactly)
    // > geometric detection (the fallback in buildMetadata). Opening a file from outside the
    // library left a temp sidecar; the build now has its own folder, so promote here by
    // writing beside it and removing the temp copy.
    if (session.library.latest) {
      const counts = new Map<string, number>();
      for (const b of resolved.blocks) {
        const nm = resolved.palette[b.state]?.Name ?? '';
        if (nm) counts.set(nm, (counts.get(nm) ?? 0) + 1);
      }
      const authoritative = !floors?.length && selection?.structureType
        ? structureFloorPlan(selection.structureType, size, { roof: selection.roof })
        : [];
      const meta = buildMetadata({
        name: path.basename(session.library.latest).replace(/\.nbt$/i, ''),
        source: session.library.latest,
        size,
        solids: resolved.blocks.map((b) => b.pos),
        paletteCounts: counts,
        floors: floors?.length ? floors : authoritative.length ? authoritative : undefined,
      });
      await writeMetadataJson(librarySidecarPath(session.library.latest), meta);
      if (basePath) await removeTempMetadata(basePath);
    }
    emitted.value = {
      ok: true,
      path: nbtPath,
      libraryPath: session.library.latest,
      version,
      summary: [(args.summary ?? '').trim(), report.fixes.length ? `(auto-fixed placement: ${report.fixes.join('; ')})` : '']
        .filter(Boolean)
        .join(' '),
      size,
      blockCount,
      sdkSessionId: session.sdkSessionId,
      // Final token totals are filled in once the driver run completes (below).
      tokensIn: 0,
      tokensOut: 0,
    };
    captureError = null;
    rounds += 1;
    if (ENV_MAX_ROUNDS == null && rounds === 1) {
      maxRounds = maxRoundsFor(size[0] * size[1] * size[2], null);
    }
    // Per-round telemetry (Console dock + dev terminal) to profile time/token cost.
    run.ai(
      `Built v${version} (${size.join('×')}, ${blockCount} blocks) on round ${rounds}/${maxRounds} · ` +
        `pass “${phaseAt(phaseIndex).label}” · ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ` +
        `in=${meter.inputTokens} out=${meter.displayedOutput()} tokens.`,
    );

    // Render this version and feed screenshots back so the model can review.
    phase = 'rendering';
    run.ai('Rendering the build and capturing multi-angle screenshots for review…');
    emitProgress(true);
    let shot: { images?: GenerateImage[]; error?: string } = {};
    if (capture) {
      try {
        shot = await capture(nbtPath, version);
      } catch (err) {
        shot = { error: errMessage(err) };
      }
    }
    phase = 'reviewing';
    run.ai('Sending the screenshots back to the model to review against the prompt and refine…');
    emitProgress(true);

    const atCap = rounds >= maxRounds;

    // The review framing: a status line, fix/warning notes, the reference (target),
    // and this version's screenshots. The design-pass gate text is appended below.
    const content = buildReviewContent({
      version,
      size,
      blockCount,
      paletteLen: authoring.palette?.length ?? 0,
      fixes: report.fixes,
      warnings: report.warnings,
      referenceImages: images,
      shot,
    });

    // Drive the model through the design passes (massing → roof → facade → interior
    // → circulation → audit), one per emit. The final Audit pass is GATED by the
    // critic: the model must report a clean checklist before it's allowed to stop.
    const nextIdx = advancePhase(phaseIndex);
    const onAudit = isLastPhase(phaseIndex); // the pass just emitted was the audit pass
    const labelFor = (id: string): string => AUDIT_CHECKS.find((c) => c.id === id)?.label ?? id;

    // On the audit pass, get the verdict that gates the stop: an INDEPENDENT critic
    // (fresh context, judges the screenshots) when the provider has one, else the
    // model's self-reported audit. The critic is what defeats the self-audit's
    // rubber-stamping; it runs only here (the final pass) to bound its cost.
    let auditReported = false; // do we have a usable verdict (clean or failed)?
    let auditFailed: { label: string; note: string }[] = [];
    let bySelf = true;
    if (onAudit && !atCap) {
      if (critic && shot.images && shot.images.length > 0) {
        phase = 'reviewing';
        run.ai('Audit pass: an independent critic (fresh context) is judging the build against the checklist…');
        emitProgress(true);
        try {
          const c = await critic({
            credential: cred, images: shot.images, buildPrompt: prompt,
            checklist: auditChecklistText(), dir: session.dir, abort: ac,
          });
          meter.addExternal(c.tokensIn ?? 0, c.tokensOut ?? 0);
          auditReported = true;
          bySelf = false;
          auditFailed = c.failed.map((f) => ({ label: labelFor(f.check), note: f.note }));
          run.ai(
            c.failed.length
              ? `Critic verdict: ${c.failed.length} check(s) need more work — ${c.failed.map((f) => labelFor(f.check)).join(', ')}.`
              : 'Critic verdict: every audit check passed.',
          );
        } catch {
          /* critic unavailable this round — fall back to the self-report below */
        }
      }
      if (!auditReported) {
        const a = summarizeAudit(args.audit);
        auditReported = a.reported;
        auditFailed = a.failed.map((f) => ({ label: f.label, note: f.note }));
      }
    }

    const gate = auditGateFeedback({
      onAudit,
      atCap,
      rounds,
      maxRounds,
      nextPhaseIndex: nextIdx,
      verdict: { reported: auditReported, failed: auditFailed, bySelf },
    });
    content.push({ type: 'text', text: gate.text });
    phaseIndex = nextIdx; // advance the pointer for the next emit (clamped at audit)

    run.ai(
      gate.stop
        ? (atCap ? 'Reached the round budget — finishing with the current build.' : 'Audit passed — the build is accepted, finishing.')
        : `Moving on to the “${phaseAt(nextIdx).label}” pass for the next revision.`,
    );

    return { content, isError: false, stop: gate.stop };
  };

  // Snapshot the running token totals — attached to EVERY result branch
  // (success, cancel, error) so the chat footer can always report the cost.
  const tokens = (): TokenTotals => meter.totals();

  const ac = beginRun(sessionId);

  let driverResult: { resultSubtype?: string | null };
  try {
    const driver = await getDriver(cred.id);
    driverResult = await driver({
      credential: cred,
      systemPrompt: systemPrompt(prompt, selection),
      userText: effectivePrompt,
      images: images ?? [],
      thinkingBudget: THINKING_BUDGET,
      abort: ac,
      resume: session.sdkSessionId,
      setSessionId: (id) => {
        session.sdkSessionId = id;
        if (emitted.value) emitted.value.sdkSessionId = id;
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
    `Generation finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ${rounds} rounds · ${turns} turns · ` +
      `in=${meter.inputTokens} out=${meter.displayedOutput()} tokens.`,
  );

  // Stamp the final token totals onto the emitted result (the box read keeps its
  // proper type, so this is a plain spread — see the `emitted` declaration above).
  if (emitted.value) return { ...emitted.value, ...tokens() };
  if (captureError) return { ok: false, error: captureError, ...tokens() };
  if (ac.signal.aborted) return { ok: false, error: 'Canceled.', canceled: true, ...tokens() };
  const subtype = driverResult.resultSubtype;
  if (subtype && subtype !== 'success') {
    return { ok: false, error: authHint(`Generation failed (${subtype}).`), ...tokens() };
  }
  return { ok: false, error: 'The model did not return a structure. Try rephrasing your request.', ...tokens() };
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
