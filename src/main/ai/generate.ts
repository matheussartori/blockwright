// AI structure generation orchestrator. Provider-agnostic: it owns sessions, the
// emit→compile→render→review handler, the revision budget, and the live progress
// accounting, then dispatches the LLM transport to the active provider's driver
// (see providers/). Drivers differ only in how they run a tool-using, multi-turn,
// streaming conversation; the build/validate/render logic below is shared.
//
// Generation can run on a subscription (Claude Code / Codex — no API credits) or
// a paid API key (Anthropic / OpenAI / Gemini); the user picks the active
// provider + model in Settings (see credentials.ts).
import { app } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { GenerateResult, GenerateProgress, GeneratePhase, GenerateImage, VersionInfo } from '@/shared/types';
import { systemPrompt } from './schema';
import type { EmitArgs } from './schema';
import { activeCredential, aiAvailable } from './credentials';
import { getDriver, RESUMABLE_PROVIDERS } from './providers';
import type { DriverProgress, EmitToolResult, NeutralBlock } from './providers/types';
import { writeStructureFile, validateAuthoring, resolveBlocks, readAuthoring, type AuthoringStructure } from '../structure/compile-structure';
import { unknownBlockIds } from '../structure/content-pack';
import { templateBlockNames } from '../structure/templates';

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
  : 8000;

/** Max emit→render→review rounds before we force the model to stop, so the
 *  self-correction loop can't run forever. When BW_AI_MAX_ROUNDS is unset we pick
 *  the cap per-build from its volume; the env override, when present, wins. */
const ENV_MAX_ROUNDS = process.env.BW_AI_MAX_ROUNDS ? Number(process.env.BW_AI_MAX_ROUNDS) : null;

/** Revision cap from a build's bounding-box volume (blocks³). Larger builds get
 *  more emit→review passes since one round can't fix both massing and interiors. */
function roundsForVolume(volume: number): number {
  if (volume > 20000) return 7;
  if (volume > 6000) return 6;
  if (volume > 1500) return 5;
  return 4;
}

export { aiAvailable };

interface Session {
  /** The provider conversation id to resume (Claude SDK / Codex thread); null
   *  until the first turn establishes it, or always null for stateless providers. */
  sdkSessionId: string | null;
  version: number;
  dir: string;
}
const sessions = new Map<string, Session>();

// AbortControllers for in-flight generations, keyed by session id, so the
// renderer can cancel a running prompt.
const activeRuns = new Map<string, AbortController>();

/** Cancel the in-flight generation for `sessionId`, if any. */
export function cancelGeneration(sessionId: string): void {
  activeRuns.get(sessionId)?.abort();
}

/** Temp root for generated structures: repo-local `.generated` in dev (gitignored),
 *  userData when packaged. Override with BW_GENERATED. */
function generatedRoot(): string {
  if (process.env.BW_GENERATED) return process.env.BW_GENERATED;
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'generated')
    : path.join(app.getAppPath(), '.generated');
}

function sessionDir(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(generatedRoot(), safe || 'session');
}

function getSession(sessionId: string): Session {
  let s = sessions.get(sessionId);
  if (!s) {
    const dir = sessionDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    s = { sdkSessionId: null, version: 0, dir };
    sessions.set(sessionId, s);
  }
  return s;
}

/** Forget a session's conversation and version counter (its files stay on disk).
 *  The next prompt starts a fresh provider session. */
export function resetSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** List the compiled `vN.nbt` versions on disk for a session, ascending. */
export function listVersions(sessionId: string): VersionInfo[] {
  const dir = sessionDir(sessionId);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return []; // no session dir yet
  }
  const out: VersionInfo[] = [];
  for (const name of names) {
    const m = /^v(\d+)\.nbt$/.exec(name);
    if (m) out.push({ version: Number(m[1]), path: path.join(dir, name) });
  }
  return out.sort((a, b) => a.version - b.version);
}

/** Restore a session's conversation id + version from persisted chat history so a
 *  follow-up prompt after an app restart resumes the same conversation. No-op
 *  once the session is live in memory (don't clobber a running one). */
export function primeSession(
  sessionId: string,
  sdkSessionId: string | null,
  version: number,
): void {
  if (sessions.has(sessionId)) return;
  const dir = sessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  sessions.set(sessionId, { sdkSessionId, version, dir });
}

/** Build the "you are editing this structure" preamble from an authoring JSON
 *  the model should start from (the open file, or a stateless provider's latest
 *  build), so a follow-up like "change the blocks" edits THAT rather than
 *  generating anew. */
function editPreamble(json: string): string {
  return (
    'You are EDITING an existing structure the user already has open in the viewer — NOT building a new ' +
    'one from scratch. Below is its CURRENT Blockwright authoring JSON (air omitted; geometry is given as ' +
    'a flat "blocks" list). Treat it as the starting point: keep everything the user did not ask to change, ' +
    'apply only the requested change, and then call emit_structure with the COMPLETE modified structure ' +
    '(same size and overall layout unless asked otherwise). You may re-express unchanged geometry as "ops" ' +
    'if that is cheaper to emit, as long as the result matches.\n\n' +
    'CURRENT STRUCTURE:\n```json\n' +
    json +
    '\n```\n\nUSER REQUEST:\n'
  );
}

/** Read an authoring JSON from disk and wrap it as an edit preamble, or '' if it
 *  can't be read. */
async function seedFromFile(basePath: string): Promise<string> {
  try {
    const authoring = await readAuthoring(basePath);
    return editPreamble(JSON.stringify(authoring));
  } catch {
    return '';
  }
}

/** Decide the edit preamble for this turn. Resumable providers carry their own
 *  conversation, so they only seed from the open file on the very first turn.
 *  Stateless providers have no server-side memory, so they re-seed every turn
 *  from the latest emitted version (or the open file on turn one). */
async function buildSeed(
  resumable: boolean,
  session: Session,
  basePath: string | undefined,
): Promise<string> {
  const fromOpenFile = async (): Promise<string> => {
    if (!basePath) return '';
    const isOwnOutput = path.resolve(basePath).startsWith(path.resolve(session.dir) + path.sep);
    return isOwnOutput ? '' : seedFromFile(basePath);
  };
  if (resumable) {
    return session.sdkSessionId === null && session.version === 0 ? fromOpenFile() : '';
  }
  // Stateless: rebuild context from the latest build, else the open file.
  if (session.version >= 1) {
    const latest = path.join(session.dir, `v${session.version}.json`);
    try {
      const json = await fsp.readFile(latest, 'utf8');
      return editPreamble(json);
    } catch {
      return '';
    }
  }
  return fromOpenFile();
}

/** Generate (or edit) the structure for `sessionId` from `prompt`. Returns the
 *  written file path + metadata, or an error message for the UI to surface.
 *  `images` are optional reference images sent as visual guidance. `basePath` is
 *  the `.nbt` currently open in the viewer; on a fresh session it seeds the model
 *  with that structure so the first prompt edits it rather than starting over.
 *  `onProgress` is called with live token/phase updates while the model works. */
export async function generateStructure(
  sessionId: string,
  prompt: string,
  images?: GenerateImage[],
  onProgress?: (p: GenerateProgress) => void,
  capture?: CapturePreview,
  basePath?: string,
): Promise<GenerateResult> {
  const session = getSession(sessionId);
  const cred = activeCredential();
  const resumable = RESUMABLE_PROVIDERS.has(cred.id);

  const seed = await buildSeed(resumable, session, basePath);
  const effectivePrompt = seed + prompt;

  // Captured by the emit handler as the model emits the structure.
  let captured: Extract<GenerateResult, { ok: true }> | null = null;
  let captureError: string | null = null;
  let rounds = 0;
  let maxRounds = ENV_MAX_ROUNDS ?? 4;

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
    const snapshot = `${phase}:${inputTokens}:${displayedOutput()}:${turns}`;
    const now = Date.now();
    if (!force && (snapshot === lastSnapshot || now - lastEmit < 150)) return;
    lastSnapshot = snapshot;
    lastEmit = now;
    onProgress({ sessionId, phase, inputTokens, outputTokens: displayedOutput(), turns });
  };
  emitProgress(true); // flip the UI to a live status immediately

  const progress: DriverProgress = {
    startTurn() {
      currentOutput = 0;
      currentThinking = 0;
      turns += 1;
      phase = 'thinking';
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

    // A patch reuses the previous version as its base and appends new geometry
    // (palette entries are append-only; later ops overwrite earlier cells). Falls
    // back to treating it as a full emit when there's no prior version.
    const input = args.structure;
    let authoring = input;
    if (args.mode === 'patch' && session.version >= 1) {
      try {
        const prevJson = await fsp.readFile(path.join(session.dir, `v${session.version}.json`), 'utf8');
        const prev = JSON.parse(prevJson) as AuthoringStructure;
        authoring = {
          DataVersion: input.DataVersion ?? prev.DataVersion,
          size: (input.size ?? prev.size) as [number, number, number],
          palette: [...(prev.palette ?? []), ...(input.palette ?? [])],
          ops: [...(prev.ops ?? []), ...(input.ops ?? [])],
          blocks: [...(prev.blocks ?? []), ...(input.blocks ?? [])],
          entities: input.entities ?? prev.entities,
        };
      } catch (err) {
        captureError = `Could not load the previous version to patch: ${errMessage(err)}`;
        return text(`${captureError}. Re-emit a COMPLETE structure with mode "full".`, true);
      }
    }

    try {
      validateAuthoring(authoring);
    } catch (err) {
      const msg = errMessage(err);
      captureError = `Generated structure was invalid: ${msg}`;
      return text(`Validation failed: ${msg}. Re-emit a corrected structure.`, true);
    }

    // Reject minecraft:light: an invisible, command-only block that doesn't render
    // in the preview and often fails to light a placed structure.
    if ((authoring.palette ?? []).some((p) => /(^|:)light$/.test(p.Name))) {
      captureError = 'Uses minecraft:light';
      return text(
        'Do not use "minecraft:light" — it is an invisible, command-only block that does not render in ' +
          'the preview and often fails to light a placed structure. Replace every light block with a VISIBLE ' +
          'fixture (lantern/soul_lantern, sea_lantern, glowstone, shroomlight, froglight, candles, ' +
          'redstone_torch, lit redstone_lamp, end_rod) and re-emit.',
        true,
      );
    }

    // Reject unknown/misspelled block IDs (incl. template-param block names).
    const templateNames = (authoring.ops ?? []).flatMap((op) =>
      op.op === 'template' ? templateBlockNames(op.name, op.params ?? {}) : [],
    );
    const unknown = unknownBlockIds([...(authoring.palette ?? []).map((p) => p.Name), ...templateNames]);
    if (unknown.length > 0) {
      captureError = `Unknown block ID(s): ${unknown.join(', ')}`;
      return text(
        `These palette block IDs do not exist in 1.21.1: ${unknown.join(', ')}. They would render as flat ` +
          'fallback colours and place as missing blocks in-game. Fix each ID (check spelling and the exact ' +
          'variant — e.g. "*_planks" vs "*_wood", "*_stairs", "_stained_glass" vs "_stained_glass_pane") and re-emit.',
        true,
      );
    }

    const version = session.version + 1;
    const nbtPath = path.join(session.dir, `v${version}.nbt`);
    try {
      await writeStructureFile(authoring, nbtPath);
      await fsp.writeFile(path.join(session.dir, `v${version}.json`), JSON.stringify(authoring, null, 2));
    } catch (err) {
      captureError = `Failed to compile the structure: ${errMessage(err)}`;
      return text(captureError, true);
    }

    session.version = version;
    const size = (authoring.size ?? [0, 0, 0]) as [number, number, number];
    const blockCount = resolveBlocks(authoring).blocks.length;
    captured = {
      ok: true,
      path: nbtPath,
      version,
      summary: (args.summary ?? '').trim(),
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
      maxRounds = roundsForVolume(size[0] * size[1] * size[2]);
    }

    // Render this version and feed screenshots back so the model can review.
    phase = 'rendering';
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
          'room layout, faux furniture, lighting, and circulation. Compare critically against the target/request: ' +
          'silhouette and massing (not a plain cube), roofline (a real pitched/edged roof with an overhang, no ' +
          'holes), facade depth and a framed entrance, proportions, materials/palette, and whether each room reads ' +
          'as laid-out and furnished rather than empty. Run the audit in 10-design-principles.md.',
      });
      for (const img of shot.images!) content.push({ type: 'image', data: img.data, mediaType: img.mediaType });
    } else {
      content.push({
        type: 'text',
        text: shot.error ? `(Preview render unavailable: ${shot.error})` : '(No preview available.)',
      });
    }

    content.push({
      type: 'text',
      text: atCap
        ? `This is the final allowed revision (round ${rounds}/${maxRounds}). Do NOT call emit_structure again — finish now.`
        : 'If the build clearly falls short, call emit_structure again. For a localized fix (a roof, a facade, ' +
          'one room) prefer mode "patch" (append only the correcting ops — far cheaper); for a big massing rework ' +
          'use mode "full". Fix the biggest problems first. If it already matches the intent well, stop and do not ' +
          'call the tool again.',
    });

    return { content, isError: false, stop: atCap };
  };

  // Snapshot the running token totals — attached to EVERY result branch
  // (success, cancel, error) so the chat footer can always report the cost.
  const tokens = (): { tokensIn: number; tokensOut: number } => ({
    tokensIn: inputTokens,
    tokensOut: displayedOutput(),
  });

  const ac = new AbortController();
  activeRuns.get(sessionId)?.abort();
  activeRuns.set(sessionId, ac);

  let driverResult: { resultSubtype?: string | null };
  try {
    const driver = await getDriver(cred.id);
    driverResult = await driver({
      credential: cred,
      systemPrompt: systemPrompt(),
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
    activeRuns.delete(sessionId);
  }

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
