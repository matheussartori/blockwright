// Google Gemini driver: a manual tool loop against the Gemini API
// (@google/genai) with a pasted API key. Gemini function declarations can't
// express the free-form maps in the authoring schema, so emit_structure takes the
// structure as a JSON string (parsed here). Like OpenAI, function responses carry
// only data, so the rendered screenshots are sent back as a follow-up user turn
// of inline images for the model to review.
import type { Content, GenerateContentConfig, GenerateContentResponseUsageMetadata, Part } from '@google/genai';
import { EMIT_TOOL_NAME, EMIT_TOOL_DESCRIPTION, parseStringArgs } from '../schema';
import type { Driver, DriverParams } from './types';

const MAX_ITERATIONS = 16;

export const geminiDriver: Driver = async (p: DriverParams) => {
  if (!p.credential.value) throw new Error('No Google Gemini API key configured.');
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: p.credential.value });

  const declaration = {
    name: EMIT_TOOL_NAME,
    description: EMIT_TOOL_DESCRIPTION,
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: 'A 1-3 sentence note: size, orientation, palette, features, assumptions.' },
        mode: { type: Type.STRING, enum: ['full', 'patch'], description: 'full = a complete structure; patch = only new geometry appended onto the previous version.' },
        structure: { type: Type.STRING, description: 'The Blockwright authoring JSON as a JSON string: { DataVersion, size, palette, ops, blocks, entities }.' },
      },
      required: ['structure'],
    },
  };

  const config: GenerateContentConfig = {
    systemInstruction: p.systemPrompt,
    tools: [{ functionDeclarations: [declaration] }],
  };
  if (p.thinkingBudget > 0 && /2\.5/.test(p.credential.model)) {
    config.thinkingConfig = { thinkingBudget: p.thinkingBudget };
  }

  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        ...p.images.map((img): Part => ({ inlineData: { mimeType: img.mediaType, data: img.data } })),
        { text: p.userText },
      ],
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (p.abort.signal.aborted) break;
    const stream = await ai.models.generateContentStream({ model: p.credential.model, contents, config });

    let started = false;
    let toolFlagged = false;
    let streamedChars = 0;
    const modelParts: Part[] = [];
    let usage: GenerateContentResponseUsageMetadata | undefined;
    for await (const chunk of stream) {
      if (!started) {
        p.progress.startTurn();
        started = true;
      }
      if (p.abort.signal.aborted) break;
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        modelParts.push(part);
        if (part.text) streamedChars += part.text.length;
        if (part.functionCall) {
          if (!toolFlagged) {
            p.progress.toolStarted();
            toolFlagged = true;
          }
          streamedChars += JSON.stringify(part.functionCall.args ?? {}).length;
        }
        p.progress.outputChars(streamedChars);
      }
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    }
    if (usage) {
      p.progress.addInput(usage.promptTokenCount ?? 0);
      if (usage.thoughtsTokenCount) p.progress.thinkingTokens(usage.thoughtsTokenCount);
      p.progress.outputTokens(usage.candidatesTokenCount ?? 0);
    }
    p.progress.endTurn();

    const calls = modelParts.flatMap((pt) => (pt.functionCall ? [pt.functionCall] : []));
    if (calls.length === 0) break; // model produced only prose — it's done

    contents.push({ role: 'model', parts: modelParts });
    const responseParts: Part[] = [];
    const reviewParts: Part[] = [];
    let stop = false;
    for (const fc of calls) {
      const name = fc.name ?? EMIT_TOOL_NAME;
      let textOut: string;
      try {
        const args = parseStringArgs(fc.args as { summary?: unknown; mode?: unknown; structure?: unknown });
        const out = await p.onEmit(args);
        textOut = out.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n\n');
        for (const b of out.content) if (b.type === 'image') reviewParts.push({ inlineData: { mimeType: b.mediaType, data: b.data } });
        if (out.stop) stop = true;
      } catch (err) {
        textOut = `Could not parse the structure JSON: ${String(err)}. Re-emit valid JSON.`;
      }
      responseParts.push({ functionResponse: { name, response: { output: textOut } } });
    }
    contents.push({ role: 'user', parts: responseParts });
    if (reviewParts.length > 0) {
      contents.push({ role: 'user', parts: [{ text: 'Rendered screenshots of your latest build, for your review:' }, ...reviewParts] });
    }
    if (stop) break;
  }
  return { resultSubtype: 'success' };
};
