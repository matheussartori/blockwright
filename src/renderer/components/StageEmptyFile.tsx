// The stage's "no blocks" empty state — shown when an opened `.nbt`/`.schem`/`.litematic`
// parsed fine but places ZERO blocks (an empty capture, or a placeholder written by another
// tool). Deliberately replaces the build planner for that tab: an empty FILE is a fact about
// the file, not an invitation to generate. Quiet cousin of StageBuilding (same card family,
// no accent/pulse); the mark is a dashed wireframe cube — a bounding box with nothing in it.
import { FolderOpen, X } from 'lucide-react';
import { useT } from '../hooks/useStores';
import { basename } from '../ui/path';

/** Isometric dashed cube: the declared-but-empty bounding box a blockless file is. */
function EmptyCube() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3.2 3.4">
        {/* top face */}
        <path d="M24 7 40 16 24 25 8 16Z" />
        {/* verticals */}
        <path d="M8 16v17M24 25v17M40 16v17" />
        {/* bottom edges */}
        <path d="M8 33l16 9 16-9" />
      </g>
    </svg>
  );
}

export function StageEmptyFile({ path, onOpen, onClose }: { path: string; onOpen: () => void; onClose: () => void }) {
  const t = useT();
  const name = basename(path);
  return (
    <div className="stage-empty">
      <div className="stage-empty-card" role="status">
        <span className="stage-empty-mark">
          <EmptyCube />
        </span>
        <h2 className="stage-empty-title">{t('emptyFile.title')}</h2>
        <p className="stage-empty-sub">{t('emptyFile.sub', { name })}</p>
        <p className="stage-empty-hint">{t('emptyFile.hint')}</p>
        <div className="stage-empty-actions">
          <button type="button" className="btn sm primary" onClick={onOpen}>
            <FolderOpen size={14} strokeWidth={1.8} aria-hidden />
            {t('emptyFile.open')}
          </button>
          <button type="button" className="btn sm" onClick={onClose}>
            <X size={14} strokeWidth={1.8} aria-hidden />
            {t('emptyFile.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
