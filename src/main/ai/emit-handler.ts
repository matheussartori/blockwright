// The emit handler: the per-emit `validate → patch → compile → mirror → render → review`
// step the model calls each time it emits a structure. Extracted from the generation
// orchestrator (generate.ts) so the orchestrator stays readable and this multi-stage glue
// is testable on its own. The pure sub-steps it sequences already live in their own
// modules (mergePatch / validateEmit / writeStructureFile / buildReviewContent /
// auditGateFeedback); this is the IO + run-state choreography between them.
//
// The handler shares MUTABLE run state with the orchestrator (the round counter, the
// design-pass pointer, the captured result, the last error) — modelled explicitly as
// {@link EmitRunState}, a single record both sides hold by reference. The orchestrator
// reads it after the driver run to assemble the final result.
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { BuildSelection, FloorDef, GenerateImage, GeneratePhase, GenerateResult } from '@/shared/types';
import type { EmitArgs } from './schema';
import type { EmitToolResult } from './providers/types';
import type { Critic } from './providers/types';
import type { ResolvedCredential } from './credentials';
import type { Session } from './session';
import { advancePhase, AUDIT_CHECKS, auditChecklistText, isLastPhase, phaseAt, summarizeAudit } from './phases';
import { auditGateFeedback } from './audit-gate';
import { maxRoundsFor } from './rounds';
import { mirrorToLibrary } from './output-dir';
import { buildMetadata, librarySidecarPath, removeTempMetadata, writeMetadataJson } from '../structure/metadata';
import { structureFloorPlan } from '../structure/domain';
import { mergePatch } from './patch';
import { validateEmit } from './emit-validate';
import { buildReviewContent } from './review-content';
import type { RunLog } from './gen-log';
import type { TokenMeter } from './token-meter';
import { writeStructureFile, type AuthoringStructure, type CompileReport, type ShellLockCell } from '../structure/authoring';
import { isAir } from '../structure/authoring/palette';

/** The successful result shape captured as the model emits — the `ok: true` arm of
 *  {@link GenerateResult}. Held in a mutable box so the orchestrator can read it after
 *  the driver run and stamp the final token totals on. */
export type CapturedOk = Extract<GenerateResult, { ok: true }>;

/** Render a just-emitted version and return screenshot(s) of it (or an error), so the
 *  model can see its own build and refine it. Supplied by the IPC layer, which round-trips
 *  to the renderer (main can't render the Three.js scene). */
export type CapturePreview = (
  path: string,
  version: number,
) => Promise<{ images?: GenerateImage[]; error?: string }>;

/** The run state the emit handler and the orchestrator share by reference. The handler
 *  ADVANCES it each emit (round counter, design-pass pointer, captured result, last
 *  error); the orchestrator's progress callback also writes `phase`/`turns`, and the
 *  post-run result assembly reads `emitted`/`captureError`/`rounds`. */
export interface EmitRunState {
  /** Coarse phase for the progress UI (thinking/building/compiling/rendering/reviewing). */
  phase: GeneratePhase;
  /** The design pass the model is on (massing → … → audit); advances one per emit. */
  phaseIndex: number;
  /** Completed emit rounds so far. */
  rounds: number;
  /** The current round cap (recomputed from build volume after the first emit on the
   *  AUTO budget). */
  maxRounds: number;
  /** Assistant turns started (owned by the progress callback; read by the progress snapshot). */
  turns: number;
  /** The last hard error to surface if the run ends with no usable build. */
  captureError: string | null;
  /** The successful result, captured as the model emits (boxed so the closure can assign it). */
  emitted: { value: CapturedOk | null };
}

/** Everything the emit handler needs, bundled so the orchestrator wires it once. The
 *  `state` is shared mutable run state (see {@link EmitRunState}); `emitProgress` pushes a
 *  throttled progress update reading that state. */
export interface EmitHandlerDeps {
  session: Session;
  /** The user's prompt (sans seed) — names the library folder + frames the critic. */
  prompt: string;
  selection?: BuildSelection;
  /** The user's Floor plan (UI), overriding the model's declared storeys for grade. */
  floors?: FloorDef[];
  images?: GenerateImage[];
  capture?: CapturePreview;
  /** Locked shell cells re-asserted on every compile (any seeded archetype). */
  lockCells?: ShellLockCell[];
  /** The independent audit critic, or null to fall back to the model's self-report. */
  critic: Critic | null;
  cred: ResolvedCredential;
  /** The currently-open `.nbt` being edited (clears its temp sidecar on first emit). */
  basePath?: string;
  abort: AbortController;
  /** The authoritative round budget (a fixed number), or null for the volume-scaled AUTO path. */
  roundsBudget: number | null;
  startedAt: number;
  run: RunLog;
  meter: TokenMeter;
  state: EmitRunState;
  /** Push a (throttled) progress update; `force` bypasses the throttle for phase flips. */
  emitProgress: (force?: boolean) => void;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the per-emit handler the driver invokes each time the model emits a structure.
 * Returns the content blocks (status + screenshots) to feed back for review, and a `stop`
 * flag once the model's audit passes or the round budget is spent.
 *
 * @param deps - The wired run context (see {@link EmitHandlerDeps}).
 * @returns The `onEmit` callback passed to the provider driver.
 */
export function createEmitHandler(deps: EmitHandlerDeps): (args: EmitArgs) => Promise<EmitToolResult> {
  const {
    session, prompt, selection, floors, images, capture, lockCells, critic, cred,
    basePath, abort, roundsBudget, startedAt, run, meter, state, emitProgress,
  } = deps;

  return async (args: EmitArgs): Promise<EmitToolResult> => {
    const text = (t: string, isError = false): EmitToolResult => ({ content: [{ type: 'text', text: t }], isError, stop: false });
    state.phase = 'compiling';
    emitProgress(true);
    run.ai(
      `The model emitted a ${args.mode === 'patch' ? 'patch' : 'full'} structure for the ` +
        `“${phaseAt(state.phaseIndex).label}” pass — validating and compiling it.`,
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
        state.captureError = `Could not load the previous version to patch: ${errMessage(err)}`;
        return text(`${state.captureError}. Re-emit a COMPLETE structure with mode "full".`, true);
      }
    }

    // Pre-compile gates: structurally valid, no minecraft:light, only real block ids.
    const rejection = validateEmit(authoring);
    if (rejection) {
      state.captureError = rejection.reason;
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
        // Re-assert a seeded archetype's locked shell so its exterior can't be gutted.
        lockCells,
        log: run.fix,
      });
    } catch (err) {
      state.captureError = `Failed to compile the structure: ${errMessage(err)}`;
      return text(state.captureError, true);
    }

    const size = (authoring.size ?? [0, 0, 0]) as [number, number, number];
    // The compile report carries the FINAL post-pass blocks (what the .nbt actually
    // contains), so stats/metadata reflect the build as fixed up — explicit air cells
    // are the interior carve, not geometry, so they're excluded.
    const solidBlocks = report.blocks.filter((b) => !isAir(report.palette[b.state]?.Name ?? ''));
    const blockCount = solidBlocks.length;

    // COLLAPSE GATE — a non-patch emit REPLACES the whole structure, so an emit that
    // carries only a delta (the model "keeping" the rest by reference — the sakura
    // "skeleton" defect: a furniture-only emit deleted the entire shell) is REJECTED,
    // not versioned. Baseline = the last accepted version's solids (or the seeded
    // shell's locked cells on the first emit); a real refinement never halves the
    // build. Deliberate demolition still has a path: a `patch` with air fills.
    const baseline = session.lastSolids ?? lockCells?.length ?? 0;
    if (args.mode !== 'patch' && baseline >= 50 && blockCount < baseline / 2) {
      await fsp.unlink(nbtPath).catch(() => {}); // drop the gutted compile from the scratch dir
      state.captureError = `Emit dropped most of the build (${blockCount} solid blocks vs ${baseline} before)`;
      run.ai(
        `Rejected the emit: it contains only ${blockCount} solid blocks where the build had ` +
          `${baseline} — a full emit must carry the COMPLETE structure, not just the changes.`,
      );
      return text(
        `REJECTED — this emit contains only ${blockCount} solid blocks, but the current build has ${baseline}. ` +
          `A mode "full" emit REPLACES the entire structure, so everything you did not re-emit (walls, floors, ` +
          `roof, the whole shell) would be DELETED. Either re-emit the COMPLETE build — every existing block/op ` +
          `plus your changes — with mode "full", or emit ONLY your additions with mode "patch" (it layers onto ` +
          `the previous version; in a patch, air fills remove specific cells if something must go).`,
        true,
      );
    }

    await fsp.writeFile(path.join(session.dir, `v${version}.json`), JSON.stringify(authoring, null, 2));
    session.version = version;
    session.lastSolids = blockCount;

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

    // Write/refresh the `.bw.json` sidecar beside the library build, so a later edit
    // has the size, dominant palette and recognised storeys to work from. Storeys come
    // from (in priority): the user's Floor plan > the AUTHORITATIVE plan of the code-built
    // structure type (tied to the shell, so a flat-roofed modern villa is labelled exactly)
    // > geometric detection (the fallback in buildMetadata). Opening a file from outside the
    // library left a temp sidecar; the build now has its own folder, so promote here by
    // writing beside it and removing the temp copy.
    if (session.library.latest) {
      const counts = new Map<string, number>();
      for (const b of solidBlocks) {
        const nm = report.palette[b.state]?.Name ?? '';
        if (nm) counts.set(nm, (counts.get(nm) ?? 0) + 1);
      }
      const authoritative = !floors?.length && selection?.structureType
        ? structureFloorPlan(selection.structureType, size, {
            roof: selection.roof,
            surroundings: selection.surroundings,
            floorHeights: selection.floorHeights,
          })
        : [];
      const meta = buildMetadata({
        name: path.basename(session.library.latest).replace(/\.nbt$/i, ''),
        source: session.library.latest,
        size,
        solids: solidBlocks.map((b) => b.pos),
        paletteCounts: counts,
        floors: floors?.length ? floors : authoritative.length ? authoritative : undefined,
      });
      await writeMetadataJson(librarySidecarPath(session.library.latest), meta);
      if (basePath) await removeTempMetadata(basePath);
    }
    state.emitted.value = {
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
      // Final token totals are filled in once the driver run completes (in generate.ts).
      tokensIn: 0,
      tokensOut: 0,
    };
    state.captureError = null;
    state.rounds += 1;
    // Auto budget: now that the first emit revealed the build's size, scale the cap to
    // its volume (floored to the full design-pass sequence). Numeric budgets are fixed.
    if (roundsBudget == null && state.rounds === 1) {
      state.maxRounds = maxRoundsFor(size[0] * size[1] * size[2], null);
    }
    // Per-round telemetry (Console dock + dev terminal) to profile time/token cost.
    run.ai(
      `Built v${version} (${size.join('×')}, ${blockCount} blocks) on round ${state.rounds}/${state.maxRounds} · ` +
        `pass “${phaseAt(state.phaseIndex).label}” · ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ` +
        `in=${meter.inputTokens} out=${meter.displayedOutput()} tokens.`,
    );

    // Render this version and feed screenshots back so the model can review.
    state.phase = 'rendering';
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
    state.phase = 'reviewing';
    run.ai('Sending the screenshots back to the model to review against the prompt and refine…');
    emitProgress(true);

    const atCap = state.rounds >= state.maxRounds;

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
    const nextIdx = advancePhase(state.phaseIndex);
    const onAudit = isLastPhase(state.phaseIndex); // the pass just emitted was the audit pass
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
        state.phase = 'reviewing';
        run.ai('Audit pass: an independent critic (fresh context) is judging the build against the checklist…');
        emitProgress(true);
        try {
          const c = await critic({
            credential: cred, images: shot.images, buildPrompt: prompt,
            checklist: auditChecklistText(), dir: session.dir, abort,
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
      rounds: state.rounds,
      maxRounds: state.maxRounds,
      nextPhaseIndex: nextIdx,
      verdict: { reported: auditReported, failed: auditFailed, bySelf },
    });
    content.push({ type: 'text', text: gate.text });
    state.phaseIndex = nextIdx; // advance the pointer for the next emit (clamped at audit)

    run.ai(
      gate.stop
        ? (atCap ? 'Reached the round budget — finishing with the current build.' : 'Audit passed — the build is accepted, finishing.')
        : `Moving on to the “${phaseAt(nextIdx).label}” pass for the next revision.`,
    );

    return { content, isError: false, stop: gate.stop };
  };
}
