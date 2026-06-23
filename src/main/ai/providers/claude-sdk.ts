// Claude (subscription) driver: drives Claude through the Anthropic Agent SDK,
// which authenticates like the Claude Code CLI — so it runs on the user's Pro/Max
// plan (their existing login or a `claude setup-token` token) with no API credits.
// The SDK manages the conversation, tool dispatch, and resume; we register the one
// `emit_structure` tool that bridges to the shared handler.
//
// The SDK + zod are ESM-only and resolve a bundled native binary relative to their
// own module path, so they're externalized from the Vite bundle (see
// vite.main.config.ts) and loaded dynamically here.
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { GenerateImage } from '@/shared/types';
import { EMIT_TOOL_NAME, EMIT_TOOL_DESCRIPTION, normalizeMode } from '../schema';
import type { EmitArgs } from '../schema';
import { DEFAULT_DATA_VERSION } from '../../structure/mc-data-version';
import { criticSystemPrompt, criticUserText, parseCritique } from '../critic';
import { authEnv, claudeExecutablePath } from '../credentials';
import type { Critic, Driver, DriverParams, NeutralBlock } from './types';

type AgentSdk = typeof import('@anthropic-ai/claude-agent-sdk');
type Zod = typeof import('zod');
let modsPromise: Promise<{ sdk: AgentSdk; z: Zod['z'] }> | null = null;
function loadMods(): Promise<{ sdk: AgentSdk; z: Zod['z'] }> {
  if (!modsPromise) {
    modsPromise = Promise.all([import('@anthropic-ai/claude-agent-sdk'), import('zod')]).then(
      ([sdk, zod]) => ({ sdk, z: zod.z }),
    );
  }
  return modsPromise;
}

/** Map the shared handler's neutral blocks to the SDK's tool-result content. */
function toSdkContent(blocks: NeutralBlock[]): Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> {
  return blocks.map((b) =>
    b.type === 'text' ? { type: 'text', text: b.text } : { type: 'image', data: b.data, mimeType: b.mediaType },
  );
}

/** A streamed user message carrying text plus any reference images (a plain
 *  string can't carry images). */
async function* imagePrompt(text: string, images: GenerateImage[]): AsyncGenerator<SDKUserMessage> {
  const content = [
    ...images.map((img) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
    })),
    { type: 'text' as const, text },
  ];
  yield { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' } as SDKUserMessage;
}

export const claudeSdkDriver: Driver = async (p: DriverParams) => {
  const { sdk, z } = await loadMods();
  let forceStop = false;
  let streamedChars = 0;

  const emit = sdk.tool(
    EMIT_TOOL_NAME,
    EMIT_TOOL_DESCRIPTION,
    {
      summary: z.string().describe('A 1-3 sentence note: size, front orientation, palette, notable features, assumptions.'),
      mode: z.enum(['full', 'patch']).default('full').describe(
        'full = a COMPLETE structure (first emit or large rework). patch = ONLY new geometry appended onto your ' +
          'PREVIOUS version (later ops overwrite earlier cells); size/DataVersion inherited, palette lists ONLY new ' +
          'entries (appended after existing ones), ops/blocks reference existing indices. Prefer patch for localized fixes.',
      ),
      phase: z.enum(['massing', 'roof', 'facade', 'interior', 'circulation', 'audit']).optional().describe(
        'The design pass you just completed (see "Design passes"). Optional — informational.',
      ),
      audit: z
        .array(z.object({ check: z.string(), ok: z.boolean(), note: z.string().optional() }))
        .optional()
        .describe(
          'On the final Audit pass: your verdict per checklist item — { check (item id), ok, note }. Patch every ' +
            'item you mark not ok and re-report; you are only done when all are ok.',
        ),
      structure: z
        .object({
          DataVersion: z.number().int().optional().describe(`Always ${DEFAULT_DATA_VERSION} for 1.21.1. Omit in a patch.`),
          size: z.array(z.number().int()).optional().describe('[sx,sy,sz] bounding box. Omit in a patch unless resizing.'),
          palette: z
            .array(z.object({ Name: z.string(), Properties: z.record(z.string(), z.string()).optional() }))
            .optional()
            .describe('Distinct block states; property values are strings. In a patch, ONLY the new entries to append.'),
          ops: z
            .array(
              z.object({
                op: z.enum(['fill', 'hollow', 'walls', 'line', 'block', 'mirror', 'rotate', 'repeat', 'roof', 'stairs', 'template']),
                from: z.array(z.number().int()).optional(),
                to: z.array(z.number().int()).optional(),
                pos: z.array(z.number().int()).optional(),
                name: z.string().optional(),
                params: z.record(z.string(), z.unknown()).optional(),
                state: z.number().int().optional(),
                axis: z.enum(['x', 'y', 'z']).optional(),
                turns: z.number().int().optional(),
                pivot: z.array(z.number().int()).optional(),
                step: z.number().int().optional(),
                count: z.number().int().optional(),
                style: z.enum(['gable', 'hip']).optional(),
                ridge: z.enum(['x', 'z']).optional(),
                fill: z.number().int().optional(),
                clear: z.number().int().optional(),
                nbt: z.record(z.string(), z.unknown()).optional(),
              }),
            )
            .optional()
            .describe(
              'PREFERRED bulk geometry, applied in order (later overwrites earlier): fill/hollow/walls/line/block, ' +
                'transforms mirror/rotate/repeat, roof (pitched *_stairs), stairs (a climbable flight — from=bottom ' +
                'step, to=top step; fill=tread support, clear=AIR index for headroom + stairwell hole), template ' +
                '(named preset). One fill = a whole wall.',
            ),
          blocks: z
            .array(z.object({ state: z.number().int(), pos: z.array(z.number().int()), nbt: z.record(z.string(), z.unknown()).optional() }))
            .optional()
            .describe('Per-block overlay on top of ops: { state, pos:[x,y,z], nbt? }. Omit air. For fine detail / block entities.'),
          entities: z.array(z.unknown()).optional().describe('Usually empty; entities do not render in the preview.'),
        })
        .describe('The authoring JSON: { DataVersion, size, palette, ops (preferred), blocks (detail), entities }.'),
    },
    async ({ summary, mode, structure, phase, audit }) => {
      const args: EmitArgs = { summary: summary ?? '', mode: normalizeMode(mode), structure: structure as EmitArgs['structure'], phase, audit };
      const result = await p.onEmit(args);
      if (result.stop) forceStop = true;
      return result.isError
        ? { content: toSdkContent(result.content), isError: true }
        : { content: toSdkContent(result.content) };
    },
  );

  const server = sdk.createSdkMcpServer({ name: 'blockwright', version: '1.0.0', tools: [emit] });
  const promptInput = p.images.length > 0 ? imagePrompt(p.userText, p.images) : p.userText;

  let resultSubtype: string | null = null;
  for await (const msg of sdk.query({
    prompt: promptInput,
    options: {
      model: p.credential.model,
      systemPrompt: p.systemPrompt,
      mcpServers: { blockwright: server },
      tools: [],
      allowedTools: [`mcp__blockwright__${EMIT_TOOL_NAME}`],
      settingSources: [],
      thinking: p.thinkingBudget > 0 ? { type: 'enabled', budgetTokens: p.thinkingBudget } : { type: 'disabled' },
      includePartialMessages: true,
      abortController: p.abort,
      env: authEnv(p.credential.id),
      cwd: p.dir,
      pathToClaudeCodeExecutable: claudeExecutablePath(),
      resume: p.resume ?? undefined,
    },
  })) {
    if ('session_id' in msg && msg.session_id) p.setSessionId(msg.session_id);
    if (msg.type === 'stream_event') trackTokens(msg.event);
    else if (msg.type === 'system' && msg.subtype === 'thinking_tokens') p.progress.thinkingTokens(msg.estimated_tokens);
    else if (msg.type === 'result') resultSubtype = msg.subtype;
    if (forceStop) {
      p.abort.abort();
      break;
    }
  }
  return { resultSubtype };

  function trackTokens(event: unknown): void {
    const e = event as {
      type?: string;
      message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
      content_block?: { type?: string };
      delta?: { partial_json?: string; text?: string };
      usage?: { output_tokens?: number };
    };
    if (e.type === 'message_start') {
      p.progress.startTurn();
      streamedChars = 0;
      const u = e.message?.usage;
      p.progress.addInput((u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0));
    } else if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
      p.progress.toolStarted();
    } else if (e.type === 'content_block_delta') {
      streamedChars += (e.delta?.partial_json ?? e.delta?.text ?? '').length;
      p.progress.outputChars(streamedChars);
    } else if (e.type === 'message_delta') {
      p.progress.outputTokens(e.usage?.output_tokens ?? 0);
    } else if (e.type === 'message_stop') {
      p.progress.endTurn();
    }
  }
};

/** Independent critic via the Agent SDK: a fresh one-shot query (no `resume`, no
 *  tools) so the model judges the screenshots with no memory of having built them. */
export const claudeSdkCritique: Critic = async (input) => {
  const { sdk } = await loadMods();
  const model = process.env.BW_AI_CRITIC_MODEL || input.credential.model;
  let text = '';
  let tokensIn = 0;
  let tokensOut = 0;
  for await (const msg of sdk.query({
    prompt: imagePrompt(criticUserText(input.buildPrompt, input.checklist), input.images),
    options: {
      model,
      systemPrompt: criticSystemPrompt(),
      tools: [],
      allowedTools: [],
      settingSources: [],
      thinking: { type: 'disabled' },
      abortController: input.abort,
      env: authEnv(input.credential.id),
      cwd: input.dir,
      pathToClaudeCodeExecutable: claudeExecutablePath(),
    },
  })) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') text += block.text;
      }
    } else if (msg.type === 'result') {
      const u = (msg as { usage?: { input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number } }).usage;
      tokensIn += (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0);
      tokensOut += u?.output_tokens ?? 0;
    }
  }
  return { ...parseCritique(text), tokensIn, tokensOut };
};
