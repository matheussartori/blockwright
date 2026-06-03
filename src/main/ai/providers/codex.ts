// Codex (ChatGPT subscription) driver. Codex is an agentic CLI wrapped by
// @openai/codex-sdk; unlike the API providers it exposes no in-process tools, so
// we drive it differently: each turn requests STRUCTURED OUTPUT (the authoring
// JSON, via `outputSchema`) instead of a tool call, parse it, run the same shared
// handler, then start the next turn on the SAME thread feeding the rendered
// screenshots back as `local_image` inputs (Codex takes images as file paths).
//
// Auth: with no API key it runs on the user's ChatGPT Plus/Pro login (`codex
// login`); an API key (CODEX_API_KEY/OPENAI_API_KEY) is used when present. The SDK
// spawns a bundled native `codex` binary, so it's externalized from the Vite
// bundle and asar-unpacked when packaged (see vite.main.config.ts / forge.config.ts).
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Input, ThreadOptions, UserInput } from '@openai/codex-sdk';
import { parseStringArgs } from '../schema';
import type { Driver, DriverParams, NeutralBlock } from './types';

const MAX_ITERATIONS = 16;

/** Codex structured-output schema (strict): the authoring JSON as a string. */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'A 1-3 sentence note: size, orientation, palette, features, assumptions.' },
    mode: { type: 'string', enum: ['full', 'patch'], description: 'full = a complete structure; patch = new geometry appended onto the previous version.' },
    structure: { type: 'string', description: 'The Blockwright authoring JSON as a JSON string.' },
  },
  required: ['summary', 'mode', 'structure'],
  additionalProperties: false,
};

let imgCounter = 0;
async function writeImage(dir: string, data: string, mediaType: string): Promise<string> {
  const ext = mediaType.includes('png') ? 'png' : mediaType.includes('webp') ? 'webp' : mediaType.includes('gif') ? 'gif' : 'jpg';
  const fp = path.join(dir, `codex-img-${Date.now()}-${imgCounter++}.${ext}`);
  await fsp.writeFile(fp, Buffer.from(data, 'base64'));
  return fp;
}

/** Build a Codex turn input from text + images (written to temp files). */
async function buildInput(dir: string, text: string, images: NeutralBlock[]): Promise<UserInput[]> {
  const input: UserInput[] = [{ type: 'text', text }];
  for (const b of images) {
    if (b.type === 'image') input.push({ type: 'local_image', path: await writeImage(dir, b.data, b.mediaType) });
  }
  return input;
}

export const codexDriver: Driver = async (p: DriverParams) => {
  const { Codex } = await import('@openai/codex-sdk');
  const codex = new Codex(p.credential.value ? { apiKey: p.credential.value } : {});
  const opts: ThreadOptions = {
    model: p.credential.model,
    workingDirectory: p.dir,
    skipGitRepoCheck: true,
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
  };
  const thread = p.resume ? codex.resumeThread(p.resume, opts) : codex.startThread(opts);

  let input: Input = await buildInput(
    p.dir,
    `${p.systemPrompt}\n\n# Your task\n\nReply ONLY with the structured output (no prose). ${p.userText}`,
    p.images.map((img) => ({ type: 'image', data: img.data, mediaType: img.mediaType })),
  );

  let resultSubtype: string | null = 'success';
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (p.abort.signal.aborted) break;
    p.progress.startTurn();
    let finalText = '';
    let chars = 0;
    let flagged = false;
    const { events } = await thread.runStreamed(input, { outputSchema: OUTPUT_SCHEMA, signal: p.abort.signal });
    for await (const ev of events) {
      if (ev.type === 'thread.started') {
        p.setSessionId(ev.thread_id);
      } else if (ev.type === 'item.started' && ev.item.type === 'agent_message') {
        if (!flagged) {
          p.progress.toolStarted();
          flagged = true;
        }
      } else if ((ev.type === 'item.updated' || ev.type === 'item.completed') && ev.item.type === 'agent_message') {
        finalText = ev.item.text;
        chars = finalText.length;
        p.progress.outputChars(chars);
      } else if ((ev.type === 'item.updated' || ev.type === 'item.completed') && ev.item.type === 'reasoning') {
        chars += ev.item.text.length;
        p.progress.outputChars(chars);
      } else if (ev.type === 'turn.completed') {
        const u = ev.usage;
        p.progress.addInput((u.input_tokens ?? 0) + (u.cached_input_tokens ?? 0));
        if (u.reasoning_output_tokens) p.progress.thinkingTokens(u.reasoning_output_tokens);
        p.progress.outputTokens(u.output_tokens ?? 0);
      } else if (ev.type === 'turn.failed' || ev.type === 'error') {
        resultSubtype = 'error';
      }
    }
    p.progress.endTurn();

    if (!finalText.trim()) break;
    let out;
    try {
      const raw = JSON.parse(finalText) as { summary?: unknown; mode?: unknown; structure?: unknown };
      out = await p.onEmit(parseStringArgs(raw));
    } catch (err) {
      // Bad JSON — ask Codex to re-emit valid structured output.
      input = [{ type: 'text', text: `Your output was not valid: ${String(err)}. Re-emit ONLY the structured output.` }];
      continue;
    }
    if (out.stop) break;
    input = await buildInput(
      p.dir,
      out.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n\n') ||
        'Review the screenshots and re-emit an improved structure.',
      out.content,
    );
  }
  return { resultSubtype };
};
