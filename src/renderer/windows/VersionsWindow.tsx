// The Versions panel: lists every compiled build (`vN.nbt`) the AI generator has
// emitted for the active tab's session, newest first. Clicking a version PREVIEWS it
// in the viewer (visualization only — the working build is unchanged). Each version
// also shows its created/modified dates and two actions: "Set as Current" promotes it
// to the base every export, manual save and AI edit builds on (the "Current" chip), and
// Delete removes it (refused for the Current version, with a confirmation). Rendered as
// a tab in the docked sidebar, or inside a FloatingWindow when torn off.
import { GitCompareArrows, Star, Trash2 } from 'lucide-react';
import { useActiveDoc, useLocale, useT } from '../hooks/useStores';
import { viewVersion, setCurrentVersion, deleteVersionEntry } from '../state/versions';
import { compareActiveWith } from '../state/diff';

export function VersionsContent() {
  const t = useT();
  const locale = useLocale();
  const doc = useActiveDoc();
  if (!doc) return null;

  // "v0" (if present) is the untouched original of an edited file, not a build —
  // the panel only matters once there's at least one generated version.
  const generated = doc.versions.filter((v) => v.version >= 1);
  if (generated.length === 0) return null;

  const latest = generated[generated.length - 1].version;
  // The version currently in the viewer: an explicit preview, else the latest.
  const shown = doc.viewingVersion ?? latest;
  // The base every export/save/AI edit uses: the promoted version, else the latest.
  const current = doc.currentVersion ?? latest;
  const busy = doc.busy;
  // Newest first — the most recent build is what you usually want; the original
  // baseline (v0) sorts to the bottom.
  const ordered = [...doc.versions].sort((a, b) => b.version - a.version);
  const label = (v: number) => (v === 0 ? t('versions.original') : `v${v}`);

  const fmt = (ms?: number): string | null =>
    ms ? new Date(ms).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : null;

  const onDelete = (v: number): void => {
    if (!window.confirm(t('versions.deleteConfirm', { label: label(v) }))) return;
    void deleteVersionEntry(doc.id, v);
  };

  return (
    <>
      <div className="versions-head">
        <p className="versions-note">{t('versions.note')}</p>
      </div>
      <ul className="versions-list">
        {ordered.map((v) => {
          const isShown = v.version === shown;
          const isLatest = v.version === latest;
          const isOriginal = v.version === 0;
          const isCurrent = v.version === current;
          const created = fmt(v.createdAt);
          // Show "modified" only when it meaningfully differs from creation (a version is
          // immutable once committed, so they usually match within the run's few seconds).
          const modified =
            v.modifiedAt && v.createdAt && v.modifiedAt - v.createdAt > 60_000 ? fmt(v.modifiedAt) : null;
          return (
            <li key={v.version} className={`version-item${isShown ? ' active' : ''}`} aria-current={isShown}>
              <div className="version-main">
                <button
                  type="button"
                  className="version-view"
                  title={
                    isShown
                      ? t('versions.showing')
                      : isOriginal
                        ? t('versions.viewOriginal')
                        : t('versions.view', { label: label(v.version) })
                  }
                  onClick={() => void viewVersion(doc.id, v.version)}
                >
                  <span className="version-label">{label(v.version)}</span>
                  {isCurrent && <span className="chip chip-current">{t('versions.current')}</span>}
                  {isLatest && !isCurrent && <span className="chip">{t('versions.latest')}</span>}
                  {isOriginal && <span className="chip">{t('versions.source')}</span>}
                  {isShown && <span className="version-shown">{t('versions.viewing')}</span>}
                </button>
                {(!isOriginal || !isShown) && (
                  <div className="version-actions">
                    {/* "What did this run change?" — diff the on-screen build against this
                        version, one click from the chain (available for v0 too). */}
                    {!isShown && (
                      <button
                        type="button"
                        className="version-act"
                        title={t('versions.compare', { label: label(v.version) })}
                        onClick={() => void compareActiveWith(v.path, label(v.version))}
                      >
                        <GitCompareArrows size={13} strokeWidth={1.9} aria-hidden />
                      </button>
                    )}
                    {!isOriginal && !isCurrent && (
                      <button
                        type="button"
                        className="version-act"
                        title={t('versions.setCurrentHint', { label: label(v.version) })}
                        disabled={busy}
                        onClick={() => void setCurrentVersion(doc.id, v.version)}
                      >
                        <Star size={13} strokeWidth={1.9} aria-hidden />
                      </button>
                    )}
                    {/* The latest/HEAD and the Current version are the seed + edit base, so they
                        can't be deleted (set another version Current first to free this one). */}
                    {!isOriginal && !isCurrent && !isLatest && (
                      <button
                        type="button"
                        className="version-act version-del"
                        title={t('versions.delete', { label: label(v.version) })}
                        disabled={busy}
                        onClick={() => onDelete(v.version)}
                      >
                        <Trash2 size={13} strokeWidth={1.9} aria-hidden />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {created && (
                <div className="version-meta">
                  {t('versions.created', { date: created })}
                  {modified && <> · {t('versions.modified', { date: modified })}</>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
