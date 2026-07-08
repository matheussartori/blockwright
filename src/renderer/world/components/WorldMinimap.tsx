// A 2D top-down minimap for the world viewer (bottom-right). Renders each mapped chunk as a colour
// cell (real terrain colours from the surface average) on a canvas, centred on the camera chunk with
// a heading arrow. The reach feature the field lacks — minutes of flying to cross chunks becomes a
// glance. Data comes from the viewer's accumulated per-chunk colours; redrawn each frame.
// Two overlay toggles ride on the map: REGION boundary lines (every 32 chunks — the chunk-level
// grid is the 3D overlay's job, 3px cells are too dense for lines) and the seed-derived SLIME
// chunks (green tint; hidden when the save records no seed).
import { useEffect, useRef, useState } from 'react';
import { Droplet, Grid3X3 } from 'lucide-react';
import { useViewer } from '../../viewer/ViewerProvider';
import { useActiveDoc, useT } from '../../hooks/useStores';
import { Tooltip } from '../../components/ui/Tooltip';
import { isSlimeChunk } from '../slime';

const SIZE = 160; // canvas px
const CELL = 3; // px per chunk
const RADIUS = Math.floor(SIZE / 2 / CELL); // chunks shown each side of centre

export function WorldMinimap() {
  const viewer = useViewer();
  const t = useT();
  const seed = useActiveDoc()?.worldMeta?.seed ?? null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [regionLines, setRegionLines] = useState(false);
  const [slime, setSlime] = useState(false);
  // Slime-chunk results are seed-pure — memoise per chunk so the per-frame redraw stays cheap.
  const slimeCache = useRef<Map<string, boolean>>(new Map());
  useEffect(() => {
    slimeCache.current = new Map();
  }, [seed]);

  useEffect(() => {
    if (!viewer) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;

    const slimeAt = (cx: number, cz: number): boolean => {
      if (!seed) return false;
      const k = `${cx},${cz}`;
      let v = slimeCache.current.get(k);
      if (v === undefined) {
        v = isSlimeChunk(seed, cx, cz);
        slimeCache.current.set(k, v);
      }
      return v;
    };

    const draw = () => {
      const cells = viewer.worldMinimap();
      const [cxw, , czw] = viewer.cameraPosition();
      const ccx = Math.floor(cxw / 16);
      const ccz = Math.floor(czw / 16);

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, SIZE, SIZE);

      const mid = SIZE / 2;
      for (const c of cells) {
        const dx = c.cx - ccx;
        const dz = c.cz - ccz;
        if (Math.abs(dx) > RADIUS || Math.abs(dz) > RADIUS) continue;
        const [r, g, b] = c.color;
        ctx.fillStyle = `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
        ctx.fillRect(mid + dx * CELL - CELL / 2, mid + dz * CELL - CELL / 2, CELL, CELL);
      }

      // Slime chunks: a green tint over every mapped-range cell (mapped or not — the
      // pattern is pure seed math, so the whole viewport can show it).
      if (slime && seed) {
        ctx.fillStyle = 'rgba(94, 215, 110, 0.5)';
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          for (let dz = -RADIUS; dz <= RADIUS; dz++) {
            if (!slimeAt(ccx + dx, ccz + dz)) continue;
            ctx.fillRect(mid + dx * CELL - CELL / 2, mid + dz * CELL - CELL / 2, CELL, CELL);
          }
        }
      }

      // Region boundaries (every 32 chunks) — the admin's r.<x>.<z>.mca orientation lines.
      if (regionLines) {
        ctx.strokeStyle = 'rgba(255, 213, 74, 0.55)';
        ctx.lineWidth = 1;
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          if ((ccx + dx) % 32 !== 0) continue;
          const px = mid + dx * CELL - CELL / 2;
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(px, SIZE);
          ctx.stroke();
        }
        for (let dz = -RADIUS; dz <= RADIUS; dz++) {
          if ((ccz + dz) % 32 !== 0) continue;
          const pz = mid + dz * CELL - CELL / 2;
          ctx.beginPath();
          ctx.moveTo(0, pz);
          ctx.lineTo(SIZE, pz);
          ctx.stroke();
        }
      }

      // Camera heading arrow at centre.
      const yaw = viewer.cameraYaw();
      ctx.save();
      ctx.translate(mid, mid);
      ctx.rotate(yaw); // 0 = north (−Z), matches world → screen (+z down)
      ctx.fillStyle = '#4f7cff';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [viewer, regionLines, slime, seed]);

  return (
    <div className="world-minimap-wrap">
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="world-minimap" />
      <div className="world-minimap-toggles">
        <Tooltip label={t('world.regionLines')}>
          <button
            type="button"
            className={`world-minimap-btn${regionLines ? ' active' : ''}`}
            aria-label={t('world.regionLines')}
            aria-pressed={regionLines}
            onClick={() => setRegionLines((v) => !v)}
          >
            <Grid3X3 size={12} />
          </button>
        </Tooltip>
        {seed && (
          <Tooltip label={t('world.slimeChunks')}>
            <button
              type="button"
              className={`world-minimap-btn${slime ? ' active slime' : ''}`}
              aria-label={t('world.slimeChunks')}
              aria-pressed={slime}
              onClick={() => setSlime((v) => !v)}
            >
              <Droplet size={12} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
