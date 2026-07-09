// Wall banners: a banner's blockstate model is particle-only — vanilla renders
// it as a block entity, layering a (white) base cloth from `entity/banner_base`
// tinted by the banner's dye color, plus optional pattern layers. For a static
// render we draw the hanging cloth as a thin panel against the wall, tinted by
// the dye color; patterns (which live in block-entity NBT) are not rendered.
import type { FaceDir, ModelFace, ResolvedModel } from '@/shared/types';
import { DYE, dyeRgb } from '../dye-colors';
import { parseRef } from '../model-loader';
import { FACING_Y, rect } from './box-uv';

const BANNER_BASE = 'minecraft/entity/banner_base';

// The cloth flag occupies a 20×40 region of the banner_base atlas (front at
// 1,1; back at 22,1). We hang it as a thin panel near the back wall, filling the
// cell height. Canonical facing=south puts the front at +z; FACING_Y rotates it.
const PANEL_FROM: [number, number, number] = [1, 0, 2];
const PANEL_TO: [number, number, number] = [15, 16, 3];

function clothFaces(tint: [number, number, number]): Partial<Record<FaceDir, ModelFace>> {
  const front: ModelFace = { texture: BANNER_BASE, uv: rect(1, 1, 21, 41), tint };
  const back: ModelFace = { texture: BANNER_BASE, uv: rect(22, 1, 42, 41), tint };
  // The thin top/bottom/side edges sample a sliver of the cloth so there are no
  // see-through gaps; they're 1px and barely visible.
  const edge: ModelFace = { texture: BANNER_BASE, uv: rect(1, 1, 2, 41), tint };
  return { south: front, north: back, up: edge, down: edge, west: edge, east: edge };
}

/** Resolve a `<color>_wall_banner` block into a synthesized cloth panel, or null. */
export function resolveWallBanner(name: string, properties: Record<string, string>): ResolvedModel[] | null {
  const { path: key } = parseRef(name);
  const m = /^(.+)_wall_banner$/.exec(key);
  if (!m) return null;

  const hex = DYE[m[1]];
  if (hex === undefined) return null;
  const faces = clothFaces(dyeRgb(hex));
  const y = FACING_Y[properties.facing] ?? 0;
  return [{ elements: [{ from: PANEL_FROM, to: PANEL_TO, faces }], y }];
}
