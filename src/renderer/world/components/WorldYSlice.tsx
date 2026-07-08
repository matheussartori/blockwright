// The world viewer's Y-slice (underground mode): a horizontal clip plane at a chosen Y —
// roofs and terrain above cut away, so caves/dungeons/basements browse like a doll's
// house. Slider + stepper in a HUD panel; `[` / `]` nudge the level (Shift ×8) whenever
// the slice is on. The level is remembered per world when Settings ▸ Viewer says so.
import { useEffect, useRef, useState } from 'react';
import { Stepper } from '../../components/ui/Stepper';
import { useSettings, useT } from '../../hooks/useStores';
import { useViewer } from '../../viewer/ViewerProvider';
import { recallSlice, rememberSlice } from '../../state/yslice';

const MIN_Y = -64;
const MAX_Y = 320;

interface Props {
  /** The open world's root (the slice-memory key). */
  root: string;
  /** Whether the slice panel is open (the HUD button drives it). */
  open: boolean;
  /** Report whether a slice is ACTIVE (the HUD button shows it while the panel is closed). */
  onActive: (active: boolean) => void;
}

export function WorldYSlice({ root, open, onActive }: Props) {
  const viewer = useViewer();
  const t = useT();
  const remember = useSettings((s) => s.ySliceRemember);
  const [y, setY] = useState<number | null>(() => (remember ? (recallSlice(root)?.y ?? null) : null));
  const yRef = useRef(y);
  yRef.current = y;

  // Apply the slice (and clear it when this world unmounts / the slice turns off).
  useEffect(() => {
    if (!viewer) return;
    viewer.setClipRange(y === null ? null : { maxY: y });
    onActive(y !== null);
    if (remember) rememberSlice(root, y === null ? null : { y });
    return () => viewer.setClipRange(null);
  }, [viewer, y, root, remember]);

  // `[` / `]` nudge the active slice from anywhere in the world view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (yRef.current === null) return;
      if (e.key !== '[' && e.key !== ']') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      const step = (e.key === ']' ? 1 : -1) * (e.shiftKey ? 8 : 1);
      setY(Math.max(MIN_Y, Math.min(MAX_Y, yRef.current + step)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  const active = y !== null;
  const level = y ?? 64;

  return (
    <div className="world-hud-yslice">
      <label className="world-yslice-toggle">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setY(e.target.checked ? level : null)}
        />
        <span>{t('world.ySlice')}</span>
      </label>
      <input
        type="range"
        min={MIN_Y}
        max={MAX_Y}
        value={level}
        disabled={!active}
        onChange={(e) => setY(Number(e.target.value))}
        aria-label={t('world.ySliceLevel')}
      />
      <Stepper
        value={level}
        onChange={(n) => setY(n)}
        min={MIN_Y}
        max={MAX_Y}
        disabled={!active}
        size="sm"
        ariaLabel={t('world.ySliceLevel')}
      />
      <span className="world-yslice-hint">{t('world.ySliceKeys')}</span>
    </div>
  );
}
