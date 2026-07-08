// Plan-view + measure chip for the structure viewer (bottom-left, beside the storey
// chip): Persp/Top/Front/Side camera presets (telephoto near-ortho — layout work needs
// plans, not perspective) and a two-point MEASURE tool — click two blocks, read the
// spans. Hidden while the block editor is live (it owns viewport clicks there).
import { useEffect, useRef, useState } from 'react';
import { Ruler } from 'lucide-react';
import type { MessageKey } from '@/shared/i18n';
import type { ViewPreset } from '../viewer/viewer';
import { useEditor, useT } from '../hooks/useStores';
import { useViewer } from '../viewer/ViewerProvider';
import { Tooltip } from './ui/Tooltip';

type Cell = [number, number, number];

/** Inclusive block span on one axis (two picks on the same block = 1). */
const span = (a: number, b: number) => Math.abs(a - b) + 1;

const PRESET_LABEL: Record<ViewPreset, MessageKey> = {
  persp: 'viewer.presetPersp',
  top: 'viewer.presetTop',
  front: 'viewer.presetFront',
  side: 'viewer.presetSide',
};

export function ViewTools() {
  const viewer = useViewer();
  const t = useT();
  const editing = useEditor((s) => s.active);
  const [preset, setPreset] = useState<ViewPreset>('persp');
  const [measuring, setMeasuring] = useState(false);
  const [points, setPoints] = useState<{ a: Cell | null; b: Cell | null }>({ a: null, b: null });
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Mirror the picked points into the scene marks; clear them when the tool goes away.
  useEffect(() => {
    if (!viewer) return;
    viewer.setMeasure(points.a, points.b);
    return () => viewer.setMeasure(null, null);
  }, [viewer, points]);

  // While measuring, a CLICK (a press that didn't drag >4px — drags still orbit) picks
  // an endpoint: first A, then B, then a fresh A. Escape clears / exits.
  useEffect(() => {
    if (!viewer || !measuring || editing) return;
    const canvas = viewer.domElement;
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) down = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0 || !down) return;
      const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
      down = null;
      if (moved > 4) return;
      const cell = viewer.pickBlock(e.clientX, e.clientY);
      if (!cell) return;
      const cur = pointsRef.current;
      if (!cur.a || cur.b) setPoints({ a: cell, b: null });
      else setPoints({ a: cur.a, b: cell });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pointsRef.current.a) setPoints({ a: null, b: null });
      else setMeasuring(false);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [viewer, measuring, editing]);

  // Leaving the tool (or entering edit mode) drops the picked points.
  useEffect(() => {
    if (!measuring || editing) setPoints({ a: null, b: null });
  }, [measuring, editing]);

  if (editing) return null;

  const pick = (p: ViewPreset) => {
    setPreset(p);
    viewer?.viewPreset(p);
  };

  const { a, b } = points;
  const readout =
    a && b
      ? `${span(a[0], b[0])} × ${span(a[1], b[1])} × ${span(a[2], b[2])} · ${Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]).toFixed(1)}`
      : a
        ? t('viewer.measureNext')
        : t('viewer.measureFirst');

  return (
    <div className="view-tools">
      <div className="storey-chip view-presets" title={t('viewer.presetsTitle')}>
        {(['persp', 'top', 'front', 'side'] as const).map((p) => (
          <button
            key={p}
            type="button"
            className={`storey-btn${preset === p ? ' active' : ''}`}
            onClick={() => pick(p)}
          >
            {t(PRESET_LABEL[p])}
          </button>
        ))}
        <Tooltip label={t('viewer.measure')} description={t('viewer.measureDesc')}>
          <button
            type="button"
            className={`storey-btn${measuring ? ' active' : ''}`}
            aria-pressed={measuring}
            aria-label={t('viewer.measure')}
            onClick={() => setMeasuring((v) => !v)}
          >
            <Ruler size={13} />
          </button>
        </Tooltip>
      </div>
      {measuring && <div className="measure-readout">{readout}</div>}
    </div>
  );
}
