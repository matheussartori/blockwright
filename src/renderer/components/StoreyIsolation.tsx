// Storey isolation for the structure viewer: pick a storey and the view clips to just
// that band (the floor-plan view builders keep asking every viewer for) — same clip-plane
// machinery as the world Y-slice. Shown as a compact chip whenever the open structure has
// a floor plan; the pick is remembered per file when Settings ▸ Viewer says so.
import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import type { FloorDef } from '@/shared/types';
import { useSettings, useT } from '../hooks/useStores';
import { useViewer } from '../viewer/ViewerProvider';
import { recallSlice, rememberSlice } from '../state/yslice';

interface Props {
  /** The open structure's floor plan (the chip hides when empty). */
  floors: FloorDef[];
  /** The slice-memory key (the structure's path); null disables remembering. */
  path: string | null;
}

export function StoreyIsolation({ floors, path }: Props) {
  const viewer = useViewer();
  const t = useT();
  const remember = useSettings((s) => s.ySliceRemember);
  const [storey, setStorey] = useState<number | null>(() => {
    if (!remember || !path) return null;
    const saved = recallSlice(path)?.storey;
    return saved !== undefined && saved < floors.length ? saved : null;
  });

  useEffect(() => {
    if (!viewer) return;
    const floor = storey !== null ? floors[storey] : undefined;
    // A floor band spans blocks from..to inclusive — clip to [from, to+1].
    viewer.setClipRange(floor ? { minY: floor.from, maxY: floor.to + 1 } : null);
    if (remember && path) rememberSlice(path, storey === null ? null : { storey });
    return () => viewer.setClipRange(null);
  }, [viewer, storey, floors, path, remember]);

  if (floors.length === 0) return null;

  return (
    <div className="storey-chip" title={t('viewer.storeyTitle')}>
      <Layers size={13} aria-hidden />
      <button
        type="button"
        className={`storey-btn${storey === null ? ' active' : ''}`}
        onClick={() => setStorey(null)}
      >
        {t('viewer.storeyAll')}
      </button>
      {floors.map((f, i) => (
        <button
          key={f.id}
          type="button"
          className={`storey-btn${storey === i ? ' active' : ''}`}
          title={f.name}
          onClick={() => setStorey(storey === i ? null : i)}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
