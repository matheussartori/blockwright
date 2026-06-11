// The stage's "building" card — shown over an empty new-build tab in the brief window
// between hitting Generate and the first compiled version loading into the viewer (after
// which the live build itself fills the stage). A centered card with the app mark and the
// shared BuildProgress block, so the moment never looks frozen. Ticks its own elapsed clock.
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useT } from '../../hooks/useStores';
import { BuildProgress } from './BuildProgress';
import type { GenerateProgress } from '@/shared/types';

export function StageBuilding({ progress, startedAt }: { progress: GenerateProgress | null; startedAt: number | null }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const elapsedMs = startedAt ? now - startedAt : 0;

  return (
    <div className="stage-building">
      <div className="stage-building-card">
        <span className="stage-building-mark">
          <Sparkles size={22} strokeWidth={1.8} aria-hidden />
        </span>
        <h2 className="stage-building-title">{t('building.title')}</h2>
        <p className="stage-building-sub">{t('building.sub')}</p>
        <BuildProgress progress={progress} elapsedMs={elapsedMs} t={t} variant="block" />
      </div>
    </div>
  );
}
