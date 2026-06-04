// Screenshot helpers for the AI self-review render bridge: turn a viewer's PNG data
// URLs into the { mediaType, data } blocks the model expects, in the order
// generate.ts labels them (exterior orbits, a vertical cross-section, then top-down
// floor-plan cutaways).
import type { GenerateImage } from '@/shared/types';
import type { Viewer } from '../viewer/viewer';

/** Split a data URL into the { mediaType, data } the model expects. */
export function toImg(url: string): GenerateImage {
  const [head, data] = url.split(',');
  return { mediaType: head.slice(5, head.indexOf(';')), data };
}

/** Multi-angle screenshots for the AI self-review loop: exterior orbits, a vertical
 *  cross-section, then top-down floor-plan cutaways. */
export function captureAll(viewer: Viewer): GenerateImage[] {
  const shots = viewer.capture();
  const section = viewer.captureSection();
  const cutaways = viewer.captureCutaways();
  return [...shots, ...section, ...cutaways].map(toImg);
}
