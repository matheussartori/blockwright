// The independent critic: the provider-neutral prompt + response parsing for a
// SEPARATE, fresh-context model call that judges a finished build's screenshots
// against the audit checklist. Because it never saw the build being made, it has no
// stake in it — so it catches the defects the builder rubber-stamps in its own
// self-audit. The per-provider transport lives in providers/ (claude-sdk, anthropic);
// these pieces are pure so they're unit-testable.
import { AUDIT_CHECKS } from './phases';

const VALID_CHECKS = new Set(AUDIT_CHECKS.map((c) => c.id));

/** System prompt for the critic call — adversarial, JSON-only. */
export function criticSystemPrompt(): string {
  return (
    'You are a STRICT, INDEPENDENT architecture reviewer for Minecraft builds. You did NOT build this — ' +
    'you have fresh eyes and no stake in it. Judge the build in the screenshots against the checklist. Be ' +
    'adversarial: assume there ARE problems and look hard for each one; only pass an item when it genuinely ' +
    'holds up. Report ONLY the FAILING items as a JSON array of objects: ' +
    '[{ "check": "<item id>", "note": "<one short sentence naming the specific defect you see>" }]. ' +
    'If every item genuinely passes, return []. Output ONLY the JSON array — no prose, no code fences.'
  );
}

/** User text for the critic call: the original request + how to read the shots + the checklist. */
export function criticUserText(buildPrompt: string, checklist: string): string {
  return (
    `The build was generated for this request:\n"${buildPrompt.trim()}"\n\n` +
    'The screenshots are: orbited EXTERIOR angles, then a vertical CROSS-SECTION, then top-down FLOOR-PLAN ' +
    'cutaways of the interior. Judge each checklist item against them and return the FAILING items as a JSON ' +
    `array (check id + note):\n${checklist}`
  );
}

/** Pull the first JSON array out of a model reply, tolerating code fences / prose. */
function extractJsonArray(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('[');
    const end = t.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* unparseable — treat as no findings */
      }
    }
    return null;
  }
}

/** Parse the critic's reply into the failing checklist items (ids validated against
 *  AUDIT_CHECKS; unknown ids and malformed entries dropped). An empty/garbled reply
 *  yields no findings. */
export function parseCritique(text: string): { failed: { check: string; note: string }[] } {
  const arr = extractJsonArray(text);
  if (!Array.isArray(arr)) return { failed: [] };
  const failed = arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => ({ check: String(x.check ?? ''), note: String(x.note ?? '').trim() }))
    .filter((x) => VALID_CHECKS.has(x.check));
  return { failed };
}
