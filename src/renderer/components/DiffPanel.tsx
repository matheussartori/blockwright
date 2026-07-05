// The structure-diff summary card, floating over the stage while a comparison is open:
// what the active build is compared against, the added/removed/changed counts (legend
// hues matching the viewer overlay), and the per-block rollup. Closing drops the diff
// view; the overlay itself is mirrored into the viewer by useViewerSync.
import { GitCompareArrows, X } from 'lucide-react';
import { useApp, useT } from '../hooks/useStores';
import { closeDiff } from '../state/diff';

/** How many per-block rows the rollup shows before the "+N more" line. */
const BLOCK_ROWS = 8;

export function DiffPanel() {
  const t = useT();
  const diff = useApp((s) => s.diff);
  if (!diff) return null;
  const { result } = diff;
  const strip = (name: string) => name.replace(/^minecraft:/, '');

  return (
    <div className="diff-panel no-drag">
      <header className="diff-head">
        <span className="diff-title">
          <GitCompareArrows size={15} strokeWidth={1.9} aria-hidden />
          {t('diff.title')}
        </span>
        <button className="editor-icon" onClick={closeDiff} aria-label={t('diff.close')}>
          <X size={15} strokeWidth={2} aria-hidden />
        </button>
      </header>
      <div className="diff-other" title={diff.otherPath}>
        {t('diff.against', { name: diff.otherName })}
      </div>
      <div className="diff-counts">
        <span className="diff-count add">+{result.added}</span>
        <span className="diff-count remove">−{result.removed}</span>
        <span className="diff-count change">~{result.changed}</span>
        <span className="diff-count same">{t('diff.same', { n: result.same })}</span>
      </div>
      {result.cells.length === 0 ? (
        <p className="diff-empty">{t('diff.identical')}</p>
      ) : (
        <ul className="diff-blocks">
          {result.byBlock.slice(0, BLOCK_ROWS).map((b) => (
            <li key={b.name} className="diff-blockrow">
              <span className="diff-blockname" title={b.name}>
                {strip(b.name)}
              </span>
              <span className="diff-blockdelta">
                {b.added > 0 && <em className="add">+{b.added}</em>}
                {b.removed > 0 && <em className="remove">−{b.removed}</em>}
                {b.changed > 0 && <em className="change">~{b.changed}</em>}
              </span>
            </li>
          ))}
          {result.byBlock.length > BLOCK_ROWS && (
            <li className="diff-more">{t('diff.more', { n: result.byBlock.length - BLOCK_ROWS })}</li>
          )}
        </ul>
      )}
      <p className="diff-legend">{t('diff.legend')}</p>
    </div>
  );
}
