// Pure floor-plan helpers: normalizing a FloorDef and turning a plan into the
// context block appended to every AI prompt. Extracted from state/generation.ts so
// they're unit-testable without pulling in the IPC/store machinery. No React, no IO.
import type { FloorDef } from '@/shared/types';

/** Normalize a floor's range to ascending [from, to], tolerating legacy records
 *  that only stored a base `y` (treated as a single-layer level at that y).
 *  @param f - A floor definition, possibly a legacy record carrying only `y`.
 *  @returns The floor with `from <= to` guaranteed and legacy `y` migrated. */
export function normalizeFloor(f: FloorDef & { y?: number }): FloorDef {
  const from = f.from ?? f.y ?? 0;
  const to = f.to ?? f.y ?? from;
  return { id: f.id, name: f.name, from: Math.min(from, to), to: Math.max(from, to), role: f.role };
}

/** Build the floor-plan context block appended to every AI prompt, or '' if no
 *  levels are defined. Sorted bottom-up; each level states its inclusive y range,
 *  so the model can map "the basement"/"the top floor" to concrete y values and
 *  keep the layout consistent across edits.
 *  @param floors - The document's defined levels (any order; normalized internally).
 *  @returns A "[Floor plan]" prompt fragment, or '' when no levels are defined. */
export function buildFloorPlan(floors: FloorDef[]): string {
  if (!floors.length) return '';
  const sorted = [...floors].map(normalizeFloor).sort((a, b) => a.from - b.from);
  const lines = sorted.map((f, i) => {
    const name = f.name.trim() || `Level ${i + 1}`;
    const range = f.to > f.from ? `y ${f.from}–${f.to}` : `y ${f.from}`;
    return `- ${name}: ${range}`;
  });
  return (
    `\n\n[Floor plan — named vertical levels the user defined for this build. ` +
    `Minecraft is Y-up and y=0 is the lowest layer. Build each level within its ` +
    `inclusive y range and keep this layout consistent across edits, so a request ` +
    `like "add windows to the basement" maps to the right y range.]\n${lines.join('\n')}`
  );
}
