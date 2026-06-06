// The pre-compile gates a just-emitted structure must clear before it's built: it
// must be structurally valid, must not use the invisible command-only `minecraft:light`
// block, and must reference only real 1.21.1 block ids. Each gate returns a `reason`
// (the short note the orchestrator records as the last error) plus the `feedback` text
// returned to the model so it can self-correct in the same turn. Extracted from
// generate.ts so the gate logic is unit-testable on its own.
import type { AuthoringStructure } from '../structure/authoring';
import { validateAuthoring } from '../structure/authoring';
import { unknownBlockIds } from '../structure/assets/content-pack';
import { composeBlockNames } from '../structure/domain';

/** A rejected emit: the short reason (recorded by the orchestrator) + the corrective
 *  feedback returned to the model. `null` means the emit passed every gate. */
export interface EmitRejection {
  reason: string;
  feedback: string;
}

/**
 * Run the pre-compile gates over a (possibly patch-merged) emit.
 *
 * @param authoring - The complete authoring structure about to be compiled.
 * @returns An {@link EmitRejection} for the first gate that fails (structural validity →
 *   `minecraft:light` ban → unknown block ids), or `null` when the emit is acceptable.
 */
export function validateEmit(authoring: AuthoringStructure): EmitRejection | null {
  try {
    validateAuthoring(authoring);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      reason: `Generated structure was invalid: ${msg}`,
      feedback: `Validation failed: ${msg}. Re-emit a corrected structure.`,
    };
  }

  // Reject minecraft:light: an invisible, command-only block that doesn't render in
  // the preview and often fails to light a placed structure.
  if ((authoring.palette ?? []).some((p) => /(^|:)light$/.test(p.Name))) {
    return {
      reason: 'Uses minecraft:light',
      feedback:
        'Do not use "minecraft:light" — it is an invisible, command-only block that does not render in ' +
        'the preview and often fails to light a placed structure. Replace every light block with a VISIBLE ' +
        'fixture (lantern/soul_lantern, sea_lantern, glowstone, shroomlight, froglight, candles, ' +
        'redstone_torch, lit redstone_lamp, end_rod) and re-emit.',
    };
  }

  // Reject unknown/misspelled block IDs (incl. template per-role override blocks).
  const templateNames = (authoring.ops ?? []).flatMap((op) =>
    op.op === 'template' ? composeBlockNames(op.params ?? {}) : [],
  );
  const unknown = unknownBlockIds([...(authoring.palette ?? []).map((p) => p.Name), ...templateNames]);
  if (unknown.length > 0) {
    return {
      reason: `Unknown block ID(s): ${unknown.join(', ')}`,
      feedback:
        `These palette block IDs do not exist in 1.21.1: ${unknown.join(', ')}. They would render as flat ` +
        'fallback colours and place as missing blocks in-game. Fix each ID (check spelling and the exact ' +
        'variant — e.g. "*_planks" vs "*_wood", "*_stairs", "_stained_glass" vs "_stained_glass_pane") and re-emit.',
    };
  }

  return null;
}
