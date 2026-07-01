// A 2D top-down minimap for the world viewer (bottom-right). Renders each mapped chunk as a colour
// cell (real terrain colours from the surface average) on a canvas, centred on the camera chunk with
// a heading arrow. The reach feature the field lacks — minutes of flying to cross chunks becomes a
// glance. Data comes from the viewer's accumulated per-chunk colours; redrawn each frame.
import { useEffect, useRef } from 'react';
import { useViewer } from '../../viewer/ViewerProvider';

const SIZE = 160; // canvas px
const CELL = 3; // px per chunk
const RADIUS = Math.floor(SIZE / 2 / CELL); // chunks shown each side of centre

export function WorldMinimap() {
  const viewer = useViewer();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!viewer) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;

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
  }, [viewer]);

  return <canvas ref={canvasRef} width={SIZE} height={SIZE} className="world-minimap" />;
}
