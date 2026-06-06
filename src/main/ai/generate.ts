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
import { mergePatch } from './patch';
import { validateEmit } from './emit-validate';
import { buildSeed } from './seed';
import { activeCredential, aiAvailable } from './credentials';
import { getCritic, getDriver, RESUMABLE_PROVIDERS } from './providers';
import { aiLog, fixLog } from './gen-log';
import type { DriverProgress, EmitToolResult, NeutralBlock } from './providers/types';
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
  const cred = activeCredential();
  const resumable = RESUMABLE_PROVIDERS.has(cred.id);
  // Independent critic for the audit gate (null on providers without one → the gate
  // falls back to the model's self-reported audit).
  const critic = await getCritic(cred.id);

  const seed = await buildSeed(resumable, session, basePath);
  const effectivePrompt = seed + prompt;

  aiLog(
    `Starting generation with the “${cred.id}” provider (${cred.model})` +
      `${critic ? ', independent critic enabled' : ''}. ` +
      `The model will plan, emit geometry, then refine over the design passes.`,
  );

  // Captured by the emit handler as the model emits the structure.
  let captured: Extract<GenerateResult, { ok: true }> | null = null;
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

  // Live progress accounting (see emitProgress). Input tokens accumulate across
  // turns (including cached context). Output is the committed total from finished
  // turns plus the current turn's running count, which during extended thinking
  // comes from the thinking-token estimate.
  let inputTokens = 0;
  let committedOutput = 0;
  let currentOutput = 0;
  let currentThinking = 0;
  let turns = 0;
  let phase: GeneratePhase = 'thinking';
  let lastEmit = 0;
  let lastSnapshot = '';
  const displayedOutput = (): number => committedOutput + Math.max(currentOutput, currentThinking);
  const emitProgress = (force = false): void => {
    if (!onProgress) return;
    const snapshot = `${phase}:${phaseIndex}:${inputTokens}:${displayedOutput()}:${turns}`;
    const now = Date.now();
    if (!force && (snapshot === lastSnapshot || now - lastEmit < 150)) return;
    lastSnapshot = snapshot;
    lastEmit = now;
    const dp = phaseAt(phaseIndex);
    onProgress({
      sessionId, phase, inputTokens, outputTokens: displayedOutput(), turns,
      designPhase: dp.label, designStep: phaseIndex + 1, designSteps: PHASES.length,
    });
  };
  emitProgress(true); // flip the UI to a live status immediately

  const progress: DriverProgress = {
    startTurn() {
      currentOutput = 0;
      currentThinking = 0;
      turns += 1;
      phase = 'thinking';
      aiLog(`Turn ${turns}: the model is thinking through the geometry…`);
      emitProgress();
    },
    addInput(tokens) {
      inputTokens += tokens;
      emitProgress();
    },
    thinkingTokens(tokens) {
      currentThinking = tokens;
      emitProgress();
    },
    toolStarted() {
      phase = 'building';
      aiLog('The model is writing the structure (emitting volumetric ops & blocks)…');
      emitProgress(true);
    },
    outputChars(totalChars) {
      currentOutput = Math.max(currentOutput, Math.round(totalChars / 4));
      emitProgress();
    },
    outputTokens(tokens) {
      currentOutput = Math.max(currentOutput, tokens);
      emitProgress();
    },
    endTurn() {
      committedOutput += Math.max(currentOutput, currentThinking);
      currentOutput = 0;
      currentThinking = 0;
    },
  };

  // The shared emit handler: validate → compile → write → render → review. Returns
  // the content blocks (status + screenshots) for the model and a `stop` flag once
  // the revision budget is spent. Drivers call this each time the model emits.
  const onEmit = async (args: EmitArgs): Promise<EmitToolResult> => {
    const text = (t: string, isError = false): EmitToolResult => ({ content: [{ type: 'text', text: t }], isError, stop: false });
    phase = 'compiling';
    emitProgress(true);
    aiLog(
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
      fixLog('Compiling to .nbt and running the code fix-up passes over the build:');
      // Thread the selected structure type so the compile runs that structure's
      // declared finalize passes (e.g. the house's single-chimney + stair-inset fixes).
      // `log` streams each pass's play-by-play into the Console dock (fix-tagged).
      report = await writeStructureFile(authoring, nbtPath, {
        structureType: selection?.structureType,
        // The user's Floor plan (UI) overrides the model's declared storeys for grade.
        floors: floors?.length ? floors : undefined,
        log: fixLog,
      });
      await fsp.writeFile(path.join(session.dir, `v${version}.json`), JSON.stringify(authoring, null, 2));
    } catch (err) {
      captureError = `Failed to compile the structure: ${errMessage(err)}`;
      return text(captureError, true);
    }

    session.version = version;

    fixLog(
      report.fixes.length || report.warnings.length
        ? `Fine-tuning complete: ${report.fixes.length} auto-fix(es), ${report.warnings.length} warning(s) left for the model.`
        : 'Fine-tuning complete: the build needed no code corrections.',
    );

    // Mirror this version to the user's library as one clean, browsable file
    // (`<slug>.nbt`) — reserved once per session from the first prompt, then
    // overwritten each version (best-effort; the scratch `vN.nbt` is the source).
    session.libraryPath = await mirrorToLibrary(session.libraryPath, prompt, nbtPath);

    const size = (authoring.size ?? [0, 0, 0]) as [number, number, number];
    const blockCount = resolveBlocks(authoring).blocks.length;
    captured = {
      ok: true,
      path: nbtPath,
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
    aiLog(
      `Built v${version} (${size.join('×')}, ${blockCount} blocks) on round ${rounds}/${maxRounds} · ` +
        `pass “${phaseAt(phaseIndex).label}” · ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ` +
        `in=${inputTokens} out=${displayedOutput()} tokens.`,
    );

    // Render this version and feed screenshots back so the model can review.
    phase = 'rendering';
    aiLog('Rendering the build and capturing multi-angle screenshots for review…');
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
    aiLog('Sending the screenshots back to the model to review against the prompt and refine…');
    emitProgress(true);

    const atCap = rounds >= maxRounds;
    const paletteLen = authoring.palette?.length ?? 0;
    const haveShots = !!shot.images && shot.images.length > 0;
    const haveRef = !!images && images.length > 0;

    const content: NeutralBlock[] = [
      {
        type: 'text',
        text:
          `Compiled and rendered as v${version} (${size.join('×')}, ${blockCount} blocks). ` +
          `Palette has ${paletteLen} entries (indices 0..${Math.max(paletteLen - 1, 0)}); ` +
          `in a patch, new palette entries you add start at index ${paletteLen}.`,
      },
    ];

    if (report.fixes.length) {
      content.push({
        type: 'text',
        text:
          `The compiler auto-corrected unsupported block placements: ${report.fixes.join('; ')}. ` +
          'Place these blocks on a valid support in future emits so they no longer need fixing.',
      });
    }
    if (report.warnings.length) {
      content.push({
        type: 'text',
        text: `PLACEMENT WARNINGS (not auto-fixed — you must correct these): ${report.warnings.join(' ')}`,
      });
    }

    if (haveRef && haveShots) {
      content.push({
        type: 'text',
        text: 'TARGET — the reference image(s) you were given. This is the goal; compare every facet of your build against it:',
      });
      for (const img of images!) content.push({ type: 'image', data: img.data, mediaType: img.mediaType });
    }

    if (haveShots) {
      content.push({
        type: 'text',
        text:
          `YOUR build v${version} follows: first the orbited EXTERIOR angles, then a VERTICAL ` +
          'CROSS-SECTION (front half clipped away, viewed straight on) showing storey heights and how floors ' +
          'stack, then top-down FLOOR-PLAN cutaways (the roof clipped away) so you can review each INTERIOR — ' +
          'room layout, faux furniture, lighting, and circulation. Review them against the focused goal for ' +
          'this design pass below.',
      });
      for (const img of shot.images!) content.push({ type: 'image', data: img.data, mediaType: img.mediaType });
    } else {
      content.push({
        type: 'text',
        text: shot.error ? `(Preview render unavailable: ${shot.error})` : '(No preview available.)',
      });
    }

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
        aiLog('Audit pass: an independent critic (fresh context) is judging the build against the checklist…');
        emitProgress(true);
        try {
          const c = await critic({
            credential: cred, images: shot.images, buildPrompt: prompt,
            checklist: auditChecklistText(), dir: session.dir, abort: ac,
          });
          inputTokens += c.tokensIn ?? 0;
          committedOutput += c.tokensOut ?? 0;
          auditReported = true;
          bySelf = false;
          auditFailed = c.failed.map((f) => ({ label: labelFor(f.check), note: f.note }));
          aiLog(
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

    aiLog(
      gate.stop
        ? (atCap ? 'Reached the round budget — finishing with the current build.' : 'Audit passed — the build is accepted, finishing.')
        : `Moving on to the “${phaseAt(nextIdx).label}” pass for the next revision.`,
    );

    return { content, isError: false, stop: gate.stop };
  };

  // Snapshot the running token totals — attached to EVERY result branch
  // (success, cancel, error) so the chat footer can always report the cost.
  const tokens = (): { tokensIn: number; tokensOut: number } => ({
    tokensIn: inputTokens,
    tokensOut: displayedOutput(),
  });

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
        if (captured) captured.sdkSessionId = id;
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
  aiLog(
    `Generation finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ${rounds} rounds · ${turns} turns · ` +
      `in=${inputTokens} out=${displayedOutput()} tokens.`,
  );

  // `captured` is only ever assigned inside the onEmit/setSessionId closures, so
  // TS's main-body flow analysis treats it as still null here (the truthy branch
  // narrows to `never`). It IS the emitted result at runtime — stamp the final
  // token totals onto it via Object.assign (which tolerates the `never` type).
  if (captured) return Object.assign(captured, tokens());
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
