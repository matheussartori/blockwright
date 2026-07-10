// Pure validation for the Worldgen Studio's editable model — the same silent
// killers the export dialog catches (empty biomes, separation ≥ spacing), plus the
// def-level codec traps (size 1–7, the 116 adapted-distance cap) and pool weight
// sanity. Shared so the panel gates Save on the exact rules a test can pin down.
import type { WorldgenModel } from '../types/worldgen-studio';
import { SPACING_MAX, SPACING_MIN } from './worldgen';
import { MAX_JIGSAW_ADAPTED_DISTANCE } from './split';

/** Vanilla's jigsaw `size` codec range (recursion depth from the start pool). */
export const SIZE_MIN = 1;
export const SIZE_MAX = 7;
/** `max_distance_from_center` codec range (1..128; ≤116 with terrain adaptation). */
export const DISTANCE_MIN = 1;
export const DISTANCE_MAX = 128;

export type StudioIssueCode =
  | 'biomes_empty'
  | 'spacing_range'
  | 'separation_ge_spacing'
  | 'size_range'
  | 'distance_range'
  | 'distance_cap'
  | 'weight_range';

export interface StudioIssue {
  level: 'error' | 'warning';
  code: StudioIssueCode;
  detail?: string;
}

/**
 * Validate an edited model before writing it back.
 *
 * @returns Issues in rule order; errors should block the save (they produce packs
 *          that fail to load or structures that never generate).
 */
export function validateStudioModel(model: WorldgenModel): StudioIssue[] {
  const out: StudioIssue[] = [];
  if (model.biomes.length === 0) out.push({ level: 'error', code: 'biomes_empty' });
  if (model.size < SIZE_MIN || model.size > SIZE_MAX) {
    out.push({ level: 'error', code: 'size_range', detail: String(model.size) });
  }
  if (model.maxDistance < DISTANCE_MIN || model.maxDistance > DISTANCE_MAX) {
    out.push({ level: 'error', code: 'distance_range', detail: String(model.maxDistance) });
  } else if (model.terrainAdaptation !== 'none' && model.maxDistance > MAX_JIGSAW_ADAPTED_DISTANCE) {
    // Vanilla adds +12 for non-none adaptation and rejects the def past 128 total.
    out.push({ level: 'error', code: 'distance_cap', detail: String(model.maxDistance) });
  }
  if (model.set) {
    if (model.set.spacing < SPACING_MIN || model.set.spacing > SPACING_MAX) {
      out.push({ level: 'error', code: 'spacing_range', detail: String(model.set.spacing) });
    }
    if (model.set.separation >= model.set.spacing) {
      out.push({ level: 'error', code: 'separation_ge_spacing', detail: `${model.set.separation} ≥ ${model.set.spacing}` });
    }
  }
  for (const el of model.pool?.elements ?? []) {
    if (el.weight < 1 || el.weight > 150) {
      // 1..150 is the vanilla weighted-list codec range.
      out.push({ level: 'error', code: 'weight_range', detail: `${el.location}: ${el.weight}` });
    }
  }
  return out;
}
