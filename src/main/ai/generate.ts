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
import { writeStructureFile, validateAuthoring, type AuthoringStructure } from '../structure/compile-structure';

/** Model used for generation; override with BW_AI_MODEL. */
const MODEL = process.env.BW_AI_MODEL || 'claude-sonnet-4-6';
/** Extended thinking. The SDK default reasons deeply, so the model spends
 *  minutes thinking before it emits — wasteful here since the knowledge base
 *  already encodes the design rules. We disable it so it builds straight away;
 *  set BW_AI_THINKING_BUDGET to a token count to re-enable a bounded budget. */
const THINKING_BUDGET = Number(process.env.BW_AI_THINKING_BUDGET) || 0;
const THINKING = THINKING_BUDGET > 0
  ? ({ type: 'enabled', budgetTokens: THINKING_BUDGET } as const)
  : ({ type: 'disabled' } as const);
/** Bound the agent loop (one emit + a validation-retry or two). */
const MAX_TURNS = Number(process.env.BW_AI_MAX_TURNS) || 8;
/** Hard ceiling so a stuck request can't hang the panel forever (ms). */
const TIMEOUT_MS = Number(process.env.BW_AI_TIMEOUT_MS) || 300_000;

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
to a real gzipped .nbt and renders in a live 3D preview.

Output ONLY by calling the "emit_structure" tool, and call it right away with the COMPLETE structure \
(not a diff). Do NOT write any plan, reasoning, or commentary before the tool call — put a 1-2 sentence \
note in the tool's "summary" field instead. Go straight to the structure.

Use the guides below as your reference and follow their hard rules exactly (1.21.1 block IDs only, \
0-indexed positions within size, blockstate property values are strings, first palette entry is air by \
convention, omit air blocks, never renumber palette indices). Make builds that look intentional, not \
just valid: 3-5 cohesive materials, surface depth, a pitched/edged roof with an overhang, a framed \
entrance, a grounded base (knowledge/nbt/10-design-principles.md). The preview validates geometry, not \
data — build interiors from block geometry (faux-furniture), since container/sign contents and entities \
do not render. Favor a clear, complete build over an oversized one so it generates promptly. For follow-up requests, edit the current structure: keep the parts that work, change \
only what was asked, append palette entries rather than mutating shared ones, and re-check bounds when \
resizing. If the tool reports a validation error, fix it and call the tool again. Do not use any other \
tools.

If the user attaches reference image(s), treat them as visual guidance: match the overall shape, \
proportions, materials, and colors you see, adapting them into buildable 1.21.1 blocks.`;

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

/** Generate (or edit) the structure for `sessionId` from `prompt`. Returns the
 *  written file path + metadata, or an error message for the UI to surface.
 *  `images` are optional reference images sent as visual guidance. `onProgress`
 *  is called with live token/phase updates while the model works. */
export async function generateStructure(
  sessionId: string,
  prompt: string,
  images?: GenerateImage[],
  onProgress?: (p: GenerateProgress) => void,
): Promise<GenerateResult> {
  const session = getSession(sessionId);
  const { sdk, z } = await loadMods();

  // Captured by the tool handler below as the model emits the structure.
  let captured: Extract<GenerateResult, { ok: true }> | null = null;
  let captureError: string | null = null;

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
      structure: z
        .object({
          DataVersion: z.number().int().describe('Always 3955 for 1.21.1.'),
          size: z.array(z.number().int()).describe('[sx, sy, sz] bounding box in blocks.'),
          palette: z
            .array(
              z.object({
                Name: z.string(),
                Properties: z.record(z.string(), z.string()).optional(),
              }),
            )
            .describe('Distinct block states; property values are strings.'),
          blocks: z
            .array(
              z.object({
                state: z.number().int(),
                pos: z.array(z.number().int()),
                nbt: z.record(z.string(), z.unknown()).optional(),
              }),
            )
            .describe('Placed blocks: { state (palette index), pos: [x,y,z], nbt? }. Omit air.'),
          entities: z
            .array(z.unknown())
            .optional()
            .describe('Usually empty; entities do not render in the preview.'),
        })
        .describe('The authoring JSON: { DataVersion, size, palette, blocks, entities }.'),
    },
    async ({ summary, structure }) => {
      const authoring = structure as AuthoringStructure;
      phase = 'compiling';
      emitProgress(true);
      try {
        validateAuthoring(authoring);
      } catch (err) {
        const msg = errMessage(err);
        captureError = `Generated structure was invalid: ${msg}`;
        return { content: [{ type: 'text', text: `Validation failed: ${msg}. Re-emit a corrected structure.` }], isError: true };
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
      const blockCount = (authoring.blocks ?? []).length;
      captured = { ok: true, path: nbtPath, version, summary: (summary ?? '').trim(), size, blockCount };
      captureError = null;
      return { content: [{ type: 'text', text: `Compiled and rendered as v${version} (${size.join('×')}, ${blockCount} blocks).` }] };
    },
  );

  const server = sdk.createSdkMcpServer({ name: 'blockwright', version: '1.0.0', tools: [emit] });
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, TIMEOUT_MS);
  // Cancel any earlier run on the same session, then register this one.
  activeRuns.get(sessionId)?.abort();
  activeRuns.set(sessionId, ac);

  // Images can't ride a plain-string prompt, so when present we feed a streamed
  // user message with image + text content blocks instead.
  const promptInput = images && images.length > 0 ? imagePrompt(prompt, images) : prompt;

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
        maxTurns: MAX_TURNS,
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
      // Once the structure is compiled we have what we need; stop early so the
      // model doesn't spend another turn writing prose we discard.
      if (captured) break;
    }
  } catch (err) {
    if (ac.signal.aborted) {
      return timedOut
        ? { ok: false, error: 'Generation timed out. Try a simpler prompt (or raise BW_AI_TIMEOUT_MS).' }
        : { ok: false, error: 'Canceled.', canceled: true };
    }
    return { ok: false, error: authHint(errMessage(err)) };
  } finally {
    clearTimeout(timer);
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
  if (ac.signal.aborted && !timedOut) return { ok: false, error: 'Canceled.', canceled: true };
  if (ac.signal.aborted) return { ok: false, error: 'Generation timed out. Try a simpler prompt.' };
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
