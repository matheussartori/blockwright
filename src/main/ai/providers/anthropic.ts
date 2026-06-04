// Claude API driver: a manual tool loop against the Anthropic Messages API with a
// pasted API key (pay-as-you-go credits), as opposed to the subscription Agent SDK
// path. Caches the big system prompt (instructions + knowledge base) so repeated
// turns are cheap, streams for live token counts, and feeds the rendered
// screenshots back as image blocks in each tool_result for the self-review loop.
import type Anthropic from '@anthropic-ai/sdk';
import { EMIT_TOOL_NAME, EMIT_TOOL_DESCRIPTION, emitJsonSchema, normalizeMode } from '../schema';
import type { EmitArgs } from '../schema';
import { criticSystemPrompt, criticUserText, parseCritique } from '../critic';
import type { Critic, Driver, DriverParams, NeutralBlock } from './types';

/** Map neutral blocks to the text/image blocks a tool_result accepts. */
function toBlocks(blocks: NeutralBlock[]): Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> {
  return blocks.map((b) =>
    b.type === 'text'
      ? { type: 'text', text: b.text }
      : { type: 'image', source: { type: 'base64', media_type: b.mediaType as Anthropic.Base64ImageSource['media_type'], data: b.data } },
  );
}

/** Hard ceiling on tool loops so a misbehaving turn can't spin forever (the round
 *  budget in onEmit normally stops us well before this). */
const MAX_ITERATIONS = 16;
const MAX_TOKENS = process.env.BW_AI_MAX_TOKENS ? Number(process.env.BW_AI_MAX_TOKENS) : 32000;

export const anthropicDriver: Driver = async (p: DriverParams) => {
  if (!p.credential.value) throw new Error('No Anthropic API key configured.');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: p.credential.value });

  const tool: Anthropic.Tool = {
    name: EMIT_TOOL_NAME,
    description: EMIT_TOOL_DESCRIPTION,
    input_schema: emitJsonSchema as unknown as Anthropic.Tool.InputSchema,
  };
  // Cache the static prefix (tools + the huge system prompt) so each turn re-reads
  // it from cache instead of re-billing it.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: p.systemPrompt, cache_control: { type: 'ephemeral' } },
  ];

  const firstUser: Anthropic.ContentBlockParam[] = [
    ...p.images.map(
      (img): Anthropic.ContentBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType as Anthropic.Base64ImageSource['media_type'], data: img.data },
      }),
    ),
    { type: 'text', text: p.userText },
  ];
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: firstUser }];

  const thinking: Anthropic.ThinkingConfigParam =
    p.thinkingBudget > 0 ? { type: 'enabled', budget_tokens: p.thinkingBudget } : { type: 'disabled' };

  const resultSubtype: string | null = 'success';
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (p.abort.signal.aborted) break;
    let streamedChars = 0;
    const stream = client.messages.stream(
      { model: p.credential.model, max_tokens: MAX_TOKENS, system, tools: [tool], messages, thinking },
      { signal: p.abort.signal },
    );
    for await (const event of stream) {
      if (event.type === 'message_start') {
        p.progress.startTurn();
        const u = event.message.usage;
        p.progress.addInput((u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0));
      } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        p.progress.toolStarted();
      } else if (event.type === 'content_block_delta') {
        const d = event.delta;
        if (d.type === 'input_json_delta') streamedChars += d.partial_json.length;
        else if (d.type === 'text_delta') streamedChars += d.text.length;
        p.progress.outputChars(streamedChars);
      } else if (event.type === 'message_delta') {
        p.progress.outputTokens(event.usage.output_tokens ?? 0);
      }
    }
    const final = await stream.finalMessage();
    p.progress.endTurn();

    const toolUses = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) break; // model is done (no further emit)

    messages.push({ role: 'assistant', content: final.content });
    const results: Anthropic.ContentBlockParam[] = [];
    let stop = false;
    for (const tu of toolUses) {
      const raw = tu.input as { summary?: string; mode?: unknown; structure?: EmitArgs['structure']; phase?: unknown; audit?: unknown };
      const args: EmitArgs = {
        summary: raw.summary ?? '',
        mode: normalizeMode(raw.mode),
        structure: raw.structure as EmitArgs['structure'],
        phase: typeof raw.phase === 'string' ? raw.phase : undefined,
        audit: Array.isArray(raw.audit) ? (raw.audit as EmitArgs['audit']) : undefined,
      };
      const out = await p.onEmit(args);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: toBlocks(out.content), is_error: out.isError || undefined });
      if (out.stop) stop = true;
    }
    messages.push({ role: 'user', content: results });
    if (stop) break;
  }
  return { resultSubtype };
};

/** Independent critic via the Messages API: a one-shot vision call with a fresh
 *  context (no build history) that judges the screenshots against the checklist. */
export const anthropicCritique: Critic = async (input) => {
  if (!input.credential.value) throw new Error('No Anthropic API key configured.');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: input.credential.value });
  const model = process.env.BW_AI_CRITIC_MODEL || input.credential.model;
  const content: Anthropic.ContentBlockParam[] = [
    ...input.images.map(
      (img): Anthropic.ContentBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType as Anthropic.Base64ImageSource['media_type'], data: img.data },
      }),
    ),
    { type: 'text', text: criticUserText(input.buildPrompt, input.checklist) },
  ];
  const res = await client.messages.create(
    { model, max_tokens: 1500, system: criticSystemPrompt(), messages: [{ role: 'user', content }] },
    { signal: input.abort.signal },
  );
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const u = res.usage;
  return {
    ...parseCritique(text),
    tokensIn: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    tokensOut: u.output_tokens ?? 0,
  };
};
