// A side-elevation schematic of how the structure sits on the ground for the chosen
// terrain_adaptation — the answer to "will it float, bury, or sit clean?" before it's ever
// generated in-world (the #1 silent worldgen defect). It's an SVG diagram (themed via CSS
// vars, like the Guide's), not a 3D scene: the ground line + the structure box + the terrain
// shaping each mode applies. Proportioned from the real structure size; illustrative, not a
// simulation (real terrain is a worldgen concern). Caption reuses the mode's own description.
import type { TerrainAdaptation } from '@/shared/domain/worldgen';
import type { MessageKey, TFunction } from '@/shared/i18n';

const W = 240;
const H = 112;
const GROUND_Y = 80;
const CX = W / 2;

/** Fit the structure's width×height (a side elevation) into the diagram, keeping its aspect. */
function box(size: [number, number, number]) {
  const [w, h] = size; // [width, height, depth] — the elevation uses width × height
  const scale = Math.min(118 / Math.max(w, 1), 56 / Math.max(h, 1));
  const bw = Math.max(22, Math.min(132, w * scale));
  const bh = Math.max(16, Math.min(60, h * scale));
  return { bw, bh, xL: CX - bw / 2, xR: CX + bw / 2, topY: GROUND_Y - bh };
}

/** The terrain shaping drawn for each mode (over the flat ground line). */
function Shaping({ adaptation, b }: { adaptation: TerrainAdaptation; b: ReturnType<typeof box> }) {
  const { bw, bh, xL, xR } = b;
  switch (adaptation) {
    case 'none':
      // A visible gap under the build — the float/clip risk of no shaping.
      return <line x1={xL + 4} y1={GROUND_Y - 8} x2={xR - 4} y2={GROUND_Y - 8} className="tp-gap" />;
    case 'beard_thin':
      // A slim foundation skirt blending the footprint into the ground.
      return <polygon points={`${xL},${GROUND_Y} ${xR},${GROUND_Y} ${xR + 7},${GROUND_Y + 11} ${xL - 7},${GROUND_Y + 11}`} className="tp-beard" />;
    case 'beard_box':
      // A heavier rectangular foundation block.
      return <rect x={xL - 9} y={GROUND_Y} width={bw + 18} height={15} className="tp-beard" />;
    case 'bury':
      // Terrain raised over the lower part of the build.
      return <rect x={xL} y={GROUND_Y - bh * 0.3} width={bw} height={bh * 0.3} className="tp-earth-over" />;
    case 'encapsulate':
      // Terrain hugging the sides up the full height.
      return (
        <>
          <rect x={xL - 6} y={GROUND_Y - bh} width={6} height={bh} className="tp-earth-over" />
          <rect x={xR} y={GROUND_Y - bh} width={6} height={bh} className="tp-earth-over" />
        </>
      );
  }
}

export function TerrainPreview({ size, adaptation, t }: { size: [number, number, number]; adaptation: TerrainAdaptation; t: TFunction }) {
  const b = box(size);
  // `none` floats the build off the ground to telegraph the risk; the rest sit on it.
  const lift = adaptation === 'none' ? 8 : 0;
  const baseY = GROUND_Y - lift;
  const doorW = Math.min(10, b.bw * 0.22);

  return (
    <div className="export-terrain">
      <svg className="tp-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(`export.terrain.${adaptation}` as MessageKey)}>
        <rect x={0} y={GROUND_Y} width={W} height={H - GROUND_Y} className="tp-earth" />
        <line x1={0} y1={GROUND_Y} x2={W} y2={GROUND_Y} className="tp-ground" />
        {/* The structure: a plain box (works for a house or a tower) with a door notch. */}
        <rect x={b.xL} y={b.topY - lift} width={b.bw} height={b.bh} className="tp-structure" />
        <rect x={CX - doorW / 2} y={baseY - 11} width={doorW} height={11} className="tp-door" />
        {/* Drawn last, so bury/encapsulate terrain reads as covering the build. */}
        <Shaping adaptation={adaptation} b={b} />
      </svg>
      <p className="tp-caption">{t(`export.terrain.${adaptation}Desc` as MessageKey)}</p>
    </div>
  );
}
