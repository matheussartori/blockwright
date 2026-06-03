// OpenAI (ChatGPT) driver: a manual tool loop against the Chat Completions API
// with a pasted API key. The emit_structure function call carries the build; the
// rendered screenshots come back in a follow-up `user` message (OpenAI `tool`
// messages are text-only and can't carry images), which the model reviews before
// the next emit.
import type OpenAI from 'openai';
import { EMIT_TOOL_NAME, EMIT_TOOL_DESCRIPTION, emitJsonSchema, normalizeMode } from '../schema';
import type { EmitArgs } from '../schema';
import type { Driver, DriverParams, NeutralBlock } from './types';

const MAX_ITERATIONS = 16;

/** Reference/review images as Chat Completions image parts (base64 data URLs). */
function imageParts(blocks: NeutralBlock[]): OpenAI.Chat.Completions.ChatCompletionContentPartImage[] {
  return blocks
    .filter((b): b is Extract<NeutralBlock, { type: 'image' }> => b.type === 'image')
    .map((b) => ({ type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.data}` } }));
}

export const openaiDriver: Driver = async (p: DriverParams) => {
  if (!p.credential.value) throw new Error('No OpenAI API key configured.');
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: p.credential.value });

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: EMIT_TOOL_NAME,
        description: EMIT_TOOL_DESCRIPTION,
        parameters: emitJsonSchema as unknown as Record<string, unknown>,
      },
    },
  ];

  const firstUser: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: p.userText },
    ...imageParts(p.images.map((img) => ({ type: 'image', data: img.data, mediaType: img.mediaType }))),
  ];
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: p.systemPrompt },
    { role: 'user', content: firstUser },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (p.abort.signal.aborted) break;
    const stream = await client.chat.completions.create(
      { model: p.credential.model, messages, tools, tool_choice: 'auto', stream: true, stream_options: { include_usage: true } },
      { signal: p.abort.signal },
    );

    let started = false;
    let toolFlagged = false;
    let streamedChars = 0;
    let text = '';
    const calls = new Map<number, { id: string; name: string; args: string }>();
    for await (const chunk of stream) {
      if (!started) {
        p.progress.startTurn();
        started = true;
      }
      const choice = chunk.choices[0];
      const delta = choice?.delta;
      if (delta?.content) {
        text += delta.content;
        streamedChars += delta.content.length;
        p.progress.outputChars(streamedChars);
      }
      for (const tc of delta?.tool_calls ?? []) {
        if (!toolFlagged) {
          p.progress.toolStarted();
          toolFlagged = true;
        }
        const cur = calls.get(tc.index) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = tc.function.name;
        if (tc.function?.arguments) {
          cur.args += tc.function.arguments;
          streamedChars += tc.function.arguments.length;
          p.progress.outputChars(streamedChars);
        }
        calls.set(tc.index, cur);
      }
      if (chunk.usage) {
        p.progress.addInput(chunk.usage.prompt_tokens ?? 0);
        p.progress.outputTokens(chunk.usage.completion_tokens ?? 0);
      }
    }
    p.progress.endTurn();

    const toolCalls = [...calls.values()].filter((c) => c.name === EMIT_TOOL_NAME && c.id);
    if (toolCalls.length === 0) break; // model produced only prose — it's done

    messages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } })),
    });

    const reviewImages: OpenAI.Chat.Completions.ChatCompletionContentPartImage[] = [];
    let stop = false;
    for (const c of toolCalls) {
      let args: EmitArgs;
      try {
        const raw = JSON.parse(c.args || '{}') as { summary?: string; mode?: unknown; structure?: EmitArgs['structure'] };
        args = { summary: raw.summary ?? '', mode: normalizeMode(raw.mode), structure: raw.structure as EmitArgs['structure'] };
      } catch (err) {
        messages.push({ role: 'tool', tool_call_id: c.id, content: `Could not parse tool arguments as JSON: ${String(err)}. Re-emit valid JSON.` });
        continue;
      }
      const out = await p.onEmit(args);
      const textOut = out.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n\n');
      messages.push({ role: 'tool', tool_call_id: c.id, content: textOut || '(compiled)' });
      reviewImages.push(...imageParts(out.content));
      if (out.stop) stop = true;
    }
    // Screenshots can't ride a tool message, so send them as a user turn the model
    // reviews before deciding whether to refine.
    if (reviewImages.length > 0) {
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: 'Rendered screenshots of your latest build, for your review:' }, ...reviewImages],
      });
    }
    if (stop) break;
  }
  return { resultSubtype: 'success' };
};
