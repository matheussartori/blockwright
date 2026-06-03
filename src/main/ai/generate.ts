// AI structure generation via the Claude Agent SDK. Instead of calling the
// Anthropic API with a billed API key, this drives Claude through the SDK, which
// authenticates like the Claude Code CLI — so it runs on the user's Claude
// Pro/Max subscription (their existing login, or a `claude setup-token` token /
// API key from Settings; see credentials.ts).
//
// The model is given the NBT knowledge base as its system prompt and a single
// in-process tool, `emit_structure`. Its handler validates + compiles the
// authoring JSON to a versioned `.nbt` (and feeds validation errors back so the
// model can self-correct within the same turn). A session id per panel session
// resumes the SDK conversation, so follow-up prompts edit the current structure
// (the generate→preview→iterate loop from knowledge/nbt/07-workflow.md).
import { app } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { GenerateResult, GenerateProgress, GeneratePhase, GenerateImage } from '@/shared/types';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { loadKnowledge } from './knowledge';
import { authEnv, claudeExecutablePath, hasConfiguredCredential } from './credentials';
import { writeStructureFile, validateAuthoring, resolveBlocks, readAuthoring, type AuthoringStructure } from '../structure/compile-structure';
import { unknownBlockIds } from '../structure/content-pack';

/** Render a just-emitted version and return screenshot(s) of it (or an error),
 *  so the model can see its own build and refine it. Supplied by the IPC layer,
 *  which round-trips to the renderer (main can't render the Three.js scene). */
export type CapturePreview = (
  path: string,
  version: number,
) => Promise<{ images?: GenerateImage[]; error?: string }>;

/** Model used for generation; override with BW_AI_MODEL. */
const MODEL = process.env.BW_AI_MODEL || 'claude-opus-4-8';
/** Extended thinking budget (tokens). Spatial builds need real planning — roofs
 *  and massing come out boxy/broken without it — so we enable it by default.
 *  Set BW_AI_THINKING_BUDGET=0 to disable, or a token count to tune the budget. */
const THINKING_BUDGET = process.env.BW_AI_THINKING_BUDGET !== undefined
  ? Number(process.env.BW_AI_THINKING_BUDGET)
  : 8000;
const THINKING = THINKING_BUDGET > 0
  ? ({ type: 'enabled', budgetTokens: THINKING_BUDGET } as const)
  : ({ type: 'disabled' } as const);
/** Max emit→render→review rounds before we force the model to stop, so the
 *  self-correction loop can't run forever. When BW_AI_MAX_ROUNDS is unset we pick
 *  the cap per-build from its volume (a manor needs more passes than a shed); the
 *  env override, when present, wins. */
const ENV_MAX_ROUNDS = process.env.BW_AI_MAX_ROUNDS ? Number(process.env.BW_AI_MAX_ROUNDS) : null;

/** Revision cap from a build's bounding-box volume (blocks³). Larger builds get
 *  more emit→review passes since one round can't fix both massing and interiors. */
function roundsForVolume(volume: number): number {
  if (volume > 20000) return 7;
  if (volume > 6000) return 6;
  if (volume > 1500) return 5;
  return 4;
}

const EMIT_TOOL_NAME = 'mcp__blockwright__emit_structure';

/** Whether generation is usable. We always allow it through: with no in-app
 *  credential the SDK can still use the user's existing Claude Code login, and a
 *  genuine auth failure surfaces as a clear error on the first attempt. */
export function aiAvailable(): boolean {
  return true;
}

/** Whether a credential is explicitly configured (drives nothing critical — the
 *  UI uses credentialInfo() — but kept for parity / future gating). */
export { hasConfiguredCredential };

// The Agent SDK and zod are ESM-only and resolve their bundled native binary
// relative to their own module path, so they're externalized from the Vite
// bundle (see vite.main.config.ts) and loaded dynamically here.
type AgentSdk = typeof import('@anthropic-ai/claude-agent-sdk');
type Zod = typeof import('zod');
let modsPromise: Promise<{ sdk: AgentSdk; z: Zod['z'] }> | null = null;
function loadMods(): Promise<{ sdk: AgentSdk; z: Zod['z'] }> {
  if (!modsPromise) {
    modsPromise = Promise.all([
      import('@anthropic-ai/claude-agent-sdk'),
      import('zod'),
    ]).then(([sdk, zod]) => ({ sdk, z: zod.z }));
  }
  return modsPromise;
}

interface Session {
  /** The SDK session id to resume; null until the first turn establishes it. */
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
 *  The next prompt starts a fresh SDK session. */
export function resetSession(sessionId: string): void {
  sessions.delete(sessionId);
}

const INSTRUCTIONS = `You are Blockwright's structure generator. You produce Minecraft Java 1.21.1 \
(DataVersion 3955) ".nbt" structures in the Blockwright authoring JSON format, which the app compiles \
to a real gzipped .nbt and renders in a live 3D preview. Your output is meant to be USED in a mod — aim \
for builds a player would be happy to find, not just technically valid boxes.

You work in a SEE-AND-REFINE loop, not one shot:
1. PLAN first. Briefly think through the massing (footprint proportions, storeys, roof shape, where the \
entrance and windows go) before emitting. Spatial builds — especially roofs — come out boxy and broken \
when dumped without planning, so spend your thinking on geometry.
2. EMIT the COMPLETE structure (not a diff) by calling "emit_structure". Keep prose out of the chat — \
put a 1-2 sentence note in the tool's "summary" field.
3. REVIEW. The tool result returns SCREENSHOTS of what you just built — orbited EXTERIOR angles plus \
top-down FLOOR-PLAN cutaways (roof clipped) that show the INTERIOR. When the user gave a reference image \
it is re-attached right beside them as the TARGET. Look critically: is the silhouette/massing right (not a \
plain cube)? Does the roof read as a real pitched/edged roof with an overhang, or is it a mess? Do the \
facades have depth and a framed entrance? In the cutaways, is each room actually laid out, lit, and \
furnished (faux-furniture) with circulation — not an empty shell? Are proportions, materials, and palette \
believable and matched to the target? Check physical validity too: any floating blocks, a freestanding \
ladder, a lantern "holding up" a pillar, a staircase into a ceiling/dead end, or an air gap beside a \
door? Run the audit in 10-design-principles.md.
4. REFINE. If the render clearly falls short, call "emit_structure" again — fix the biggest problems \
first (massing and roof before trim). For a localized fix (a roof, one facade, one room, lighting) prefer \
mode "patch": append ONLY the new ops that overwrite the wrong cells (later ops win), keeping everything \
else — it is far cheaper than re-serializing the whole build, so you can afford more passes. Use mode \
"full" only for the first emit or a large massing rework. When the render genuinely matches the intent, \
STOP and do not call the tool again. You get a limited number of revision rounds, so make each one count; \
don't keep tweaking a build that is already good.

Build with "ops" (volumetric operations) for almost everything — they are far cheaper to emit than \
per-block entries. A solid box is one "fill"; a room shell is one "hollow"; the 4 outer sides are one \
"walls"; a beam is one "line". Ops apply in order and later ops overwrite earlier cells, so layer \
coarse-to-fine: lay shells, carve openings by filling an air index, then add detail. Reserve the \
"blocks" array for the handful of cells that need block-entity nbt or one-off detail. Do NOT enumerate \
large volumes block-by-block.

CRITICAL — keep interiors empty. Any enclosed or habitable volume (a room, a house body, a tower) MUST be \
a SHELL: use "hollow" (or "walls" + a floor "fill" + a ceiling "fill"), NEVER a solid "fill" of the whole \
box. Use solid "fill" only for things that are genuinely solid (a floor slab, a foundation, a pillar, a \
1-block-thin wall). If you "fill" a 3D box that has an inside, you bury the interior in stone and the \
player cannot enter — that is always a bug. Build the shell first, then carve doors/windows, then place \
interior detail in the empty space.

Use the guides below as your reference and follow their hard rules exactly (1.21.1 block IDs only, \
0-indexed positions within size, blockstate property values are strings, first palette entry is air by \
convention, omit air blocks, never renumber palette indices). Make builds that look intentional: 3-5 \
cohesive materials, surface depth, a pitched/edged roof with an overhang, a framed entrance, a grounded \
base, articulated massing for larger builds (wings/sections with their own roofs rather than one giant \
box). Avoid the symmetric cube: give larger builds an irregular silhouette (L/T footprint, a wing, \
bay, porch, tower, or off-centre entrance) with a front that differs from the back — not four \
interchangeable faces. The preview validates geometry, not data — build interiors from block geometry \
(faux-furniture), and FURNISH them fully: an empty room is a worse failure than a busy one, so line the \
walls of every habitable room with furniture, storage, and wall decoration, leaving only the centre as \
walking space — do not hand off bare rooms. Light every interior with VISIBLE \
fixtures (lantern/soul_lantern, sea_lantern, glowstone, shroomlight, froglight, candles, \
redstone_torch, lit redstone_lamp, end_rod) — NEVER use "minecraft:light": it is an invisible, \
command-only block that doesn't render in the preview and often fails to light a placed structure. For follow-up requests, edit the current \
structure: keep the parts that work, change only what was asked, append palette entries rather than \
mutating shared ones, and re-check bounds when resizing. If the tool reports a validation error, fix it \
and call the tool again. Do not use any other tools.

PHYSICAL VALIDITY (the build must survive being placed in a real world — the preview does NOT simulate \
Minecraft's support rules, so enforce them yourself): nothing floats — every block traces down to the \
ground or is attached to a wall/ceiling. A "ladder" needs a SOLID BLOCK BEHIND IT (opposite its \
"facing") and breaks in-game if freestanding — run ladders flush against a wall, never as a column in \
open air, and make every ladder/staircase actually climb to a reachable floor (cut the ceiling hole), \
never into a solid ceiling or a dead end. A lantern is a LIGHT, not a support: set it on a block below \
or hang it with hanging:"true" from a block above — never put a lantern under a pillar/beam as if it \
holds it up. A door fills a 1-wide gap in an OTHERWISE SOLID wall with solid jambs on both sides and a \
floor beneath it — never leave an air gap right beside a door (that defeats its purpose), and aim its \
"facing"/"hinge" so it opens into the room. See 10-design-principles.md §"Physical validity".

If the user attaches reference image(s), treat them as the target: match the overall shape, proportions, \
roofline, materials, and colors you see, adapting them into buildable 1.21.1 blocks, and use the \
screenshots to check how close you got. If a reference is a SPEC SHEET / blueprint rather than a photo \
(it lists an explicit block palette, footprint dimensions, storey count, or per-floor plans), TRANSCRIBE \
it before building: map each listed block to a palette entry, fix "size" from the stated footprint/height, \
and lay out each floor from its plan — this is a precision copy, not a free interpretation.`;

function systemPrompt(): string {
  return `${INSTRUCTIONS}\n\n# NBT generation knowledge base\n\n${loadKnowledge()}`;
}

/** Build the SDK prompt as a single streamed user message carrying the text plus
 *  any reference images as base64 content blocks (a plain string can't carry
 *  images). Yielded once, then the generator ends, which the SDK treats as the
 *  turn's complete input. */
async function* imagePrompt(text: string, images: GenerateImage[]): AsyncGenerator<SDKUserMessage> {
  const content = [
    ...images.map((img) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
    })),
    { type: 'text' as const, text },
  ];
  yield {
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
    session_id: '',
  } as SDKUserMessage;
}

/** Build the seed preamble that hands the model the structure the user already
 *  has open, so a first prompt like "change the blocks" edits THAT file instead
 *  of generating a brand-new structure. Returns '' when there's nothing to seed
 *  (no file, or it failed to read). */
async function seedFromOpenFile(basePath: string): Promise<string> {
  let authoring: AuthoringStructure;
  try {
    authoring = await readAuthoring(basePath);
  } catch {
    return ''; // unreadable/missing — fall back to generating from scratch
  }
  const json = JSON.stringify(authoring);
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
  const { sdk, z } = await loadMods();

  // On the first turn of a session, seed the conversation with the structure the
  // user has open so "change X" edits it. Later turns already carry the model's
  // own emitted versions, so we don't re-seed (and skip files this session itself
  // generated, which live under the session dir).
  let effectivePrompt = prompt;
  if (basePath && session.sdkSessionId === null && session.version === 0) {
    const seedDir = path.resolve(session.dir);
    const isOwnOutput = path.resolve(basePath).startsWith(seedDir + path.sep);
    if (!isOwnOutput) {
      const preamble = await seedFromOpenFile(basePath);
      if (preamble) effectivePrompt = preamble + prompt;
    }
  }

  // Captured by the tool handler below as the model emits the structure.
  let captured: Extract<GenerateResult, { ok: true }> | null = null;
  let captureError: string | null = null;
  // Number of structures emitted this generation, and a flag set once we've hit
  // the revision cap so the message loop can stop the model. The cap starts at a
  // default and is raised to fit the build's volume after the first emit (unless
  // pinned by BW_AI_MAX_ROUNDS).
  let rounds = 0;
  let maxRounds = ENV_MAX_ROUNDS ?? 4;
  let forceStop = false;

  // Live progress: input tokens accumulate across turns (including cached context
  // so the number reflects the real prompt size). Output is the committed total
  // from finished turns plus the current turn's running count — which during
  // extended thinking comes from the thinking-token estimate (message_delta only
  // reports output tokens at the end of a turn). Emits are deduped + throttled so
  // a chatty stream doesn't flood the IPC channel.
  let inputTokens = 0;
  let committedOutput = 0;
  let currentOutput = 0;
  let currentThinking = 0;
  let streamedChars = 0; // length of the tool JSON streamed so far this turn
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

  const emit = sdk.tool(
    'emit_structure',
    'Emit the generated Minecraft structure in the Blockwright authoring JSON format, plus a short summary.',
    {
      summary: z
        .string()
        .describe(
          'A 1-3 sentence note for the user: chosen size, front orientation, material palette, notable features, and any interpretation/assumptions.',
        ),
      mode: z
        .enum(['full', 'patch'])
        .default('full')
        .describe(
          'full = a COMPLETE structure (the first emit, or a large rework of the massing). ' +
            'patch = ONLY new geometry appended onto your PREVIOUS version, to fix specific ' +
            'problems cheaply (later ops overwrite earlier cells). In a patch, "size"/' +
            '"DataVersion" are inherited (omit them unless resizing), "palette" lists ONLY the ' +
            'NEW entries (they get appended after the existing ones — new indices start at the ' +
            'count reported in the last tool result), and "ops"/"blocks" reference existing ' +
            'palette indices as-is. Do NOT resend unchanged geometry in a patch. Prefer patch ' +
            'for localized fixes (one roof, one facade, one room); use full only when starting ' +
            'over or reworking the whole shape.',
        ),
      structure: z
        .object({
          DataVersion: z.number().int().optional().describe('Always 3955 for 1.21.1. Omit in a patch.'),
          size: z.array(z.number().int()).optional().describe('[sx, sy, sz] bounding box in blocks. Omit in a patch unless resizing.'),
          palette: z
            .array(
              z.object({
                Name: z.string(),
                Properties: z.record(z.string(), z.string()).optional(),
              }),
            )
            .optional()
            .describe('Distinct block states; property values are strings. In a patch, ONLY the new entries to append.'),
          ops: z
            .array(
              z.object({
                op: z.enum(['fill', 'hollow', 'walls', 'line', 'block', 'mirror', 'rotate', 'repeat', 'roof']),
                from: z.array(z.number().int()).optional().describe('[x,y,z] corner — for fill/hollow/walls/line/mirror/rotate/repeat/roof.'),
                to: z.array(z.number().int()).optional().describe('[x,y,z] opposite corner — same ops as "from".'),
                pos: z.array(z.number().int()).optional().describe('[x,y,z] — for the "block" op only.'),
                state: z.number().int().optional().describe('Palette index. Required for fill/hollow/walls/line/block/roof (roof: a *_stairs block). Use an air index to carve. Omit for mirror/rotate/repeat.'),
                axis: z.enum(['x', 'y', 'z']).optional().describe('mirror: "x" or "z" (reflection plane). repeat: "x"/"y"/"z" (tiling direction).'),
                turns: z.number().int().optional().describe('rotate: clockwise quarter-turns (1, 2 or 3) about the pivot, viewed from above.'),
                pivot: z.array(z.number().int()).optional().describe('rotate: [x,z] pivot (defaults to the region centre).'),
                step: z.number().int().optional().describe('repeat: cells to advance per copy along axis (may be negative).'),
                count: z.number().int().optional().describe('repeat: total instances including the original (≥1).'),
                style: z.enum(['gable', 'hip']).optional().describe('roof: "gable" (default, two slopes) or "hip" (four slopes).'),
                ridge: z.enum(['x', 'z']).optional().describe('roof gable: axis the ridge runs along (defaults to the longer side).'),
                fill: z.number().int().optional().describe('roof: optional palette index to plug the gap under each step (solid roof / attic floor).'),
                nbt: z.record(z.string(), z.unknown()).optional().describe('Block-entity NBT — "block" op only.'),
              }),
            )
            .optional()
            .describe(
              'PREFERRED bulk geometry, applied in order (later overwrites earlier). Placement ops: ' +
                'fill (solid box from→to), hollow (6-face shell), walls (4 vertical sides only), ' +
                'line (3D line from→to), block (single cell at pos). Transform ops act on cells placed ' +
                'by EARLIER ops and rewrite facing/axis/shape/hinge as they copy: mirror (reflect a ' +
                'region onto itself across its centre plane — build half a symmetric facade, then mirror ' +
                'it), rotate (turn a region about a pivot — build one arm of a cross/tower, rotate it 4×), ' +
                'repeat (tile a region along an axis — window bays, columns). roof lays a pitched *_stairs ' +
                'roof over an eave rectangle. Describe big builds with ops — one fill = a whole wall, one ' +
                'mirror = a whole symmetric half — instead of thousands of per-block entries.',
            ),
          blocks: z
            .array(
              z.object({
                state: z.number().int(),
                pos: z.array(z.number().int()),
                nbt: z.record(z.string(), z.unknown()).optional(),
              }),
            )
            .optional()
            .describe('Per-block overlay on top of ops: { state, pos:[x,y,z], nbt? }. Omit air. Use for fine detail / block entities.'),
          entities: z
            .array(z.unknown())
            .optional()
            .describe('Usually empty; entities do not render in the preview.'),
        })
        .describe('The authoring JSON: { DataVersion, size, palette, ops (preferred bulk geometry), blocks (detail overlay), entities }.'),
    },
    async ({ summary, mode, structure }) => {
      phase = 'compiling';
      emitProgress(true);

      // A patch reuses the previous version as its base and appends new geometry
      // (palette entries are append-only so existing indices stay valid, and later
      // ops overwrite earlier cells). This keeps refine rounds cheap — fix a roof
      // with a handful of ops instead of re-serializing the whole build. Falls back
      // to treating it as a full emit when there's no prior version to patch.
      const input = structure as AuthoringStructure;
      let authoring = input;
      if (mode === 'patch' && session.version >= 1) {
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
          return { content: [{ type: 'text', text: `${captureError}. Re-emit a COMPLETE structure with mode "full".` }], isError: true };
        }
      }

      try {
        validateAuthoring(authoring);
      } catch (err) {
        const msg = errMessage(err);
        captureError = `Generated structure was invalid: ${msg}`;
        return { content: [{ type: 'text', text: `Validation failed: ${msg}. Re-emit a corrected structure.` }], isError: true };
      }

      // Reject minecraft:light: it's an invisible, command-only technical block that
      // doesn't render in the preview and often fails to light a placed structure.
      // Force the model to use visible fixtures (lanterns/glowstone/candles/…) so the
      // build is actually lit in-game and the review loop can see the lighting.
      if ((authoring.palette ?? []).some((p) => /(^|:)light$/.test(p.Name))) {
        captureError = 'Uses minecraft:light';
        return {
          content: [{
            type: 'text',
            text: 'Do not use "minecraft:light" — it is an invisible, command-only block that does not ' +
              'render in the preview and often fails to light a placed structure. Replace every light block ' +
              'with a VISIBLE fixture (lantern/soul_lantern, sea_lantern, glowstone, shroomlight, froglight, ' +
              'candles, redstone_torch, lit redstone_lamp, end_rod) and re-emit.',
          }],
          isError: true,
        };
      }

      // Reject unknown/misspelled block IDs: they render as a flat fallback colour
      // in the preview and place as nothing (missing block) in-game, so catch them
      // here against the real content-pack block set and have the model fix the ID.
      const unknown = unknownBlockIds((authoring.palette ?? []).map((p) => p.Name));
      if (unknown.length > 0) {
        captureError = `Unknown block ID(s): ${unknown.join(', ')}`;
        return {
          content: [{
            type: 'text',
            text: `These palette block IDs do not exist in 1.21.1: ${unknown.join(', ')}. They would render ` +
              'as flat fallback colours and place as missing blocks in-game. Fix each ID (check spelling and the ' +
              'exact variant — e.g. "*_planks" vs "*_wood", "*_stairs", "_stained_glass" vs "_stained_glass_pane") ' +
              'and re-emit.',
          }],
          isError: true,
        };
      }

      const version = session.version + 1;
      const nbtPath = path.join(session.dir, `v${version}.nbt`);
      try {
        await writeStructureFile(authoring, nbtPath);
        // Keep the authoring JSON alongside for debugging / reuse.
        await fsp.writeFile(path.join(session.dir, `v${version}.json`), JSON.stringify(authoring, null, 2));
      } catch (err) {
        captureError = `Failed to compile the structure: ${errMessage(err)}`;
        return { content: [{ type: 'text', text: captureError }], isError: true };
      }

      session.version = version;
      const size = (authoring.size ?? [0, 0, 0]) as [number, number, number];
      const blockCount = resolveBlocks(authoring).blocks.length;
      captured = { ok: true, path: nbtPath, version, summary: (summary ?? '').trim(), size, blockCount };
      captureError = null;
      rounds += 1;
      // On the first emit, size the revision budget to the build (unless pinned).
      if (ENV_MAX_ROUNDS == null && rounds === 1) {
        maxRounds = roundsForVolume(size[0] * size[1] * size[2]);
      }

      // Render this version and feed screenshots back so the model can review its
      // own build against the request/reference and refine it.
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
      if (atCap) forceStop = true;

      const paletteLen = authoring.palette?.length ?? 0;
      const head =
        `Compiled and rendered as v${version} (${size.join('×')}, ${blockCount} blocks). ` +
        `Palette has ${paletteLen} entries (indices 0..${Math.max(paletteLen - 1, 0)}); ` +
        `in a patch, new palette entries you add start at index ${paletteLen}.`;
      const haveShots = !!shot.images && shot.images.length > 0;
      const haveRef = !!images && images.length > 0;

      const content: Array<
        { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
      > = [{ type: 'text', text: head }];

      // Re-attach the reference image(s) right next to the build screenshots:
      // models compare two adjacent images far more reliably than recalling the
      // reference from many turns back. Only when the user supplied one.
      if (haveRef && haveShots) {
        content.push({
          type: 'text',
          text: 'TARGET — the reference image(s) you were given. This is the goal; compare every facet of your build against it:',
        });
        for (const img of images) content.push({ type: 'image', data: img.data, mimeType: img.mediaType });
      }

      if (haveShots) {
        content.push({
          type: 'text',
          text:
            `YOUR build v${version} follows: first the orbited EXTERIOR angles, then a VERTICAL ` +
            'CROSS-SECTION (front half clipped away, viewed straight on) showing storey heights and ' +
            'how floors stack, then top-down FLOOR-PLAN cutaways (the roof clipped away) so you can ' +
            'review each INTERIOR — room layout, faux furniture, lighting, and circulation. Compare ' +
            'critically against the target/request: ' +
            'silhouette and massing (not a plain cube), roofline (a real pitched/edged roof with an ' +
            'overhang, no holes), facade depth and a framed entrance, proportions, materials/palette, and ' +
            'whether each room reads as laid-out and furnished rather than empty. Run the audit in ' +
            '10-design-principles.md.',
        });
        for (const img of shot.images ?? []) {
          content.push({ type: 'image', data: img.data, mimeType: img.mediaType });
        }
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
          : 'If the build clearly falls short, call emit_structure again. For a localized fix (a roof, ' +
            'a facade, one room) prefer mode "patch" (append only the correcting ops — far cheaper); ' +
            'for a big massing rework use mode "full". Fix the biggest problems first. If it already ' +
            'matches the intent well, stop and do not call the tool again.',
      });

      return { content };
    },
  );

  const server = sdk.createSdkMcpServer({ name: 'blockwright', version: '1.0.0', tools: [emit] });
  const ac = new AbortController();
  // Cancel any earlier run on the same session, then register this one.
  activeRuns.get(sessionId)?.abort();
  activeRuns.set(sessionId, ac);

  // Images can't ride a plain-string prompt, so when present we feed a streamed
  // user message with image + text content blocks instead.
  const promptInput = images && images.length > 0 ? imagePrompt(effectivePrompt, images) : effectivePrompt;

  let resultSubtype: string | null = null;
  try {
    for await (const msg of sdk.query({
      prompt: promptInput,
      options: {
        model: MODEL,
        systemPrompt: systemPrompt(),
        mcpServers: { blockwright: server },
        tools: [], // no built-in tools — emit_structure is the only one
        allowedTools: [EMIT_TOOL_NAME],
        settingSources: [], // isolate from any local CLAUDE.md / settings
        thinking: THINKING, // emit straight away instead of long reasoning
        includePartialMessages: true, // stream events → live token counts
        abortController: ac,
        env: authEnv(),
        cwd: session.dir,
        pathToClaudeCodeExecutable: claudeExecutablePath(),
        resume: session.sdkSessionId ?? undefined,
      },
    })) {
      if ('session_id' in msg && msg.session_id) session.sdkSessionId = msg.session_id;
      if (msg.type === 'stream_event') trackTokens(msg.event);
      else if (msg.type === 'system' && msg.subtype === 'thinking_tokens') {
        currentThinking = msg.estimated_tokens; // live liveness during thinking
        emitProgress();
      } else if (msg.type === 'result') resultSubtype = msg.subtype;
      // The model self-reviews each emitted version (see the tool handler) and
      // re-emits until it's satisfied or it hits the round cap. When capped, we
      // already have the final build, so stop the run instead of paying for
      // another turn. Otherwise let the conversation end naturally.
      if (forceStop) {
        ac.abort();
        break;
      }
    }
  } catch (err) {
    if (ac.signal.aborted) {
      return { ok: false, error: 'Canceled.', canceled: true };
    }
    return { ok: false, error: authHint(errMessage(err)) };
  } finally {
    activeRuns.delete(sessionId);
  }

  // Track input/output tokens from the raw Anthropic stream events.
  function trackTokens(event: unknown): void {
    const e = event as {
      type?: string;
      message?: {
        usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
      };
      content_block?: { type?: string };
      delta?: { partial_json?: string; text?: string };
      usage?: { output_tokens?: number };
    };
    if (e.type === 'message_start') {
      const u = e.message?.usage;
      // Include cached context so the figure reflects the real prompt size (the
      // bulky knowledge base is sent once then read from cache).
      inputTokens += (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
      currentOutput = 0;
      currentThinking = 0;
      streamedChars = 0;
      turns += 1;
      // A new turn begins with reasoning (planning the build, or reviewing the
      // previous render); reflect that until the tool call flips us to 'building'.
      phase = 'thinking';
      emitProgress();
    } else if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
      phase = 'building';
      emitProgress(true);
    } else if (e.type === 'content_block_delta') {
      // The tool JSON (and any text) streams here with no token count, so estimate
      // ~4 chars/token to keep the counter alive while the structure is written.
      streamedChars += (e.delta?.partial_json ?? e.delta?.text ?? '').length;
      currentOutput = Math.max(currentOutput, Math.round(streamedChars / 4));
      emitProgress();
    } else if (e.type === 'message_delta') {
      currentOutput = Math.max(currentOutput, e.usage?.output_tokens ?? 0);
      emitProgress();
    } else if (e.type === 'message_stop') {
      committedOutput += Math.max(currentOutput, currentThinking);
      currentOutput = 0;
      currentThinking = 0;
      streamedChars = 0;
    }
  }

  if (captured) return captured;
  if (captureError) return { ok: false, error: captureError };
  if (ac.signal.aborted) return { ok: false, error: 'Canceled.', canceled: true };
  if (resultSubtype && resultSubtype !== 'success') {
    return { ok: false, error: authHint(`Generation failed (${resultSubtype}).`) };
  }
  return { ok: false, error: 'The model did not return a structure. Try rephrasing your request.' };
}

/** Append a hint about Claude Code auth when the failure looks credential-related. */
function authHint(message: string): string {
  if (/auth|login|401|403|credential|token|unauthor|forbidden/i.test(message)) {
    return `${message}\n\nThis looks like an authentication problem. Log into Claude Code (run \`claude\` in a terminal), or add a token/API key in Settings.`;
  }
  return message;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
