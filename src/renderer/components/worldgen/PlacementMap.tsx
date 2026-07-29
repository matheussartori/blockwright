// A top-down plan of how the structure_set's spacing/separation actually scatter the
// structure across chunks — the answer to "how often, and how far apart?" without
// generating a world. Spacing/separation are the two most opaque numbers in worldgen
// (they read as blocks, they're chunks; separation reads as a distance, it's really a
// jitter budget), so the panel draws them: the cell grid is `spacing`, the shaded
// square inside each cell is the sub-square a structure can roll into, and the marks
// are one deterministic roll per cell. Illustrative, not vanilla's RNG — the shape of
// the distribution is the point.
import { useMemo } from 'react';
import type { TFunction } from '@/shared/i18n';
import { placementStats } from '@/shared/domain/worldgen-studio';

/** Columns drawn — enough to read as a pattern, few enough to stay legible. The
 *  height follows from whole rows, so no cell is ever clipped mid-square. */
const CELLS = 4;
const W = 240;
const CELL = W / CELLS;
const ROWS = 2;
const H = CELL * ROWS;

/** A stable per-cell roll: the map must not reshuffle on every re-render. */
function roll(cx: number, cz: number, salt: number): number {
  let h = Math.imul(cx * 374761393 + cz * 668265263 + salt * 1442695041, 1);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface PlacementMapProps {
  spacing: number;
  separation: number;
  t: TFunction;
}

export function PlacementMap({ spacing, separation, t }: PlacementMapProps) {
  const stats = placementStats(spacing, separation);
  // The roll window as a fraction of the cell: 1 = anywhere, 0 = pinned to the corner.
  const jitterFrac = stats.jitterChunks / Math.max(1, spacing);
  const inset = CELL * jitterFrac;

  const marks = useMemo(() => {
    const out: { key: string; cellX: number; cellY: number; x: number; y: number }[] = [];
    for (let cz = 0; cz < ROWS; cz++) {
      for (let cx = 0; cx < CELLS; cx++) {
        out.push({
          key: `${cx}:${cz}`,
          cellX: cx * CELL,
          cellY: cz * CELL,
          x: cx * CELL + roll(cx, cz, 1) * inset,
          y: cz * CELL + roll(cx, cz, 2) * inset,
        });
      }
    }
    return out;
  }, [inset]);

  return (
    <div className="studio-map">
      <svg
        className="pm-diagram"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('studio.placementAria', {
          chunks: String(stats.cellChunks),
          blocks: String(stats.typicalBlocks),
        })}
      >
        {/* The cell grid — one placement attempt per cell. */}
        {Array.from({ length: CELLS - 1 }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * CELL} y1={0} x2={(i + 1) * CELL} y2={H} className="pm-grid" />
        ))}
        {Array.from({ length: ROWS - 1 }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={(i + 1) * CELL} x2={W} y2={(i + 1) * CELL} className="pm-grid" />
        ))}
        {/* The roll window inside each cell — what separation eats into. */}
        {inset > 1 &&
          marks.map((m) => (
            <rect key={`w${m.key}`} x={m.cellX} y={m.cellY} width={inset} height={inset} className="pm-window" />
          ))}
        {marks.map((m) => (
          <rect key={m.key} x={m.x + 1} y={m.y + 1} width={9} height={9} rx={1.5} className="pm-mark" />
        ))}
      </svg>
      <p className="pm-readout">
        <span className="pm-figure">{t('studio.placementDensity', { chunks: String(stats.cellChunks) })}</span>
        <span className="pm-sep" aria-hidden>
          ·
        </span>
        {t('studio.placementDistance', { blocks: String(stats.typicalBlocks) })}
        {stats.minBlocks > 0 && (
          <>
            <span className="pm-sep" aria-hidden>
              ·
            </span>
            {t('studio.placementFloor', { blocks: String(stats.minBlocks) })}
          </>
        )}
      </p>
    </div>
  );
}
