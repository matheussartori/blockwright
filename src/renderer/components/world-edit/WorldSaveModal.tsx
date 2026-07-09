// The "Save to World" dialog — the preview-then-write discipline, pointed at terrain: BEFORE a
// byte moves it shows the write plan (blocks / chunks / region files as stat tiles), what the
// pipeline guarantees (enforced backup, game-side relight), and any platform caution; AFTER the
// write it reports what actually happened, including per-chunk refusals (a proto chunk is
// refused, never "best-effort" written). Exiting with pending edits routes here too, so
// discarding is always an explicit choice.
import { useMemo, useState } from 'react';
import { Archive, CheckCircle2, History, Lightbulb, TriangleAlert } from 'lucide-react';
import { useSettings, useT, useWorldEdit } from '../../hooks/useStores';
import { worldEditStore } from '../../state/world-edit';
import { chunkKeyOf } from '../../world/edit-overlay';
import { Modal } from '../ui/Modal';

export function WorldSaveModal() {
  const t = useT();
  const open = useWorldEdit((s) => s.saveOpen);
  const pending = useWorldEdit((s) => s.pending);
  const pendingCount = useWorldEdit((s) => s.pendingCount);
  const pendingEntities = useWorldEdit((s) => s.pendingEntities);
  const saving = useWorldEdit((s) => s.saving);
  const report = useWorldEdit((s) => s.lastReport);
  const error = useWorldEdit((s) => s.error);
  const lockExclusive = useWorldEdit((s) => s.lockExclusive);
  const retention = useSettings((s) => s.worldBackupRetention);
  const sizeCapMb = useSettings((s) => s.worldBackupSizeCapMb);
  const [done, setDone] = useState(false);
  const we = worldEditStore.getState;

  // The write plan: how many chunks and regions this save will touch.
  const plan = useMemo(() => {
    const chunks = new Set<string>();
    const regions = new Set<string>();
    for (const e of Object.values(pending)) {
      chunks.add(chunkKeyOf(e.x, e.z));
      regions.add(`${Math.floor(e.x / 512)},${Math.floor(e.z / 512)}`);
    }
    return { chunks: chunks.size, regions: regions.size };
  }, [pending]);

  const close = () => {
    setDone(false);
    we().setSaveOpen(false);
  };

  if (!open) return null;

  // The entities tile only appears when a placement carries some — most saves are block-only.
  const stats: { value: number; label: string }[] = done
    ? [
        { value: report?.changedBlocks ?? 0, label: t('worldEdit.statBlocks') },
        ...((report?.placedEntities ?? 0) > 0 ? [{ value: report!.placedEntities, label: t('worldEdit.statEntities') }] : []),
        { value: report?.editedChunks.length ?? 0, label: t('worldEdit.statChunks') },
        { value: report?.regions.length ?? 0, label: t('worldEdit.statRegions') },
      ]
    : [
        { value: pendingCount, label: t('worldEdit.statBlocks') },
        ...(pendingEntities.length > 0 ? [{ value: pendingEntities.length, label: t('worldEdit.statEntities') }] : []),
        { value: plan.chunks, label: t('worldEdit.statChunks') },
        { value: plan.regions, label: t('worldEdit.statRegions') },
      ];

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : close}
      title={t('worldEdit.saveTitle')}
      footer={
        done ? (
          <button className="btn primary" onClick={close}>
            {t('worldEdit.done')}
          </button>
        ) : (
          <>
            {pendingCount > 0 && (
              <button
                className="link worldsave-discard"
                disabled={saving}
                onClick={() => {
                  we().discard();
                  close();
                  void we().exit();
                }}
              >
                {t('worldEdit.discardAndExit')}
              </button>
            )}
            <span className="spacer" />
            <button className="btn" disabled={saving} onClick={close}>
              {t('common.cancel')}
            </button>
            <button
              className="btn primary"
              disabled={saving || !pendingCount}
              onClick={() => {
                void we()
                  .save(retention, sizeCapMb)
                  .then((r) => {
                    if (r) setDone(true);
                  });
              }}
            >
              {saving ? t('worldEdit.saving') : t('worldEdit.confirmSave')}
            </button>
          </>
        )
      }
    >
      <div className="worldsave-body">
        {done && (
          <div className="worldsave-success">
            <CheckCircle2 size={16} strokeWidth={1.9} aria-hidden />
            {t('worldEdit.saveResultTitle')}
          </div>
        )}

        <div className="worldsave-stats">
          {stats.map((s) => (
            <div className="worldsave-stat" key={s.label}>
              <span className="worldsave-stat-value">{s.value.toLocaleString()}</span>
              <span className="worldsave-stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        {!done ? (
          <>
            <ul className="worldsave-notes">
              <li>
                <Archive size={13} strokeWidth={1.9} aria-hidden />
                {t('worldEdit.saveBackupNote')}
              </li>
              <li>
                <Lightbulb size={13} strokeWidth={1.9} aria-hidden />
                {t('worldEdit.saveRelightNote')}
              </li>
              {retention > 0 && (
                <li>
                  <History size={13} strokeWidth={1.9} aria-hidden />
                  {t('worldEdit.saveRetentionNote', { n: retention })}
                </li>
              )}
            </ul>
            {!lockExclusive && (
              <div className="worldsave-callout warn">
                <TriangleAlert size={14} strokeWidth={1.9} aria-hidden />
                <span>{t('worldEdit.lockCautionDesc')}</span>
              </div>
            )}
            {error && (
              <div className="worldsave-callout error">
                <TriangleAlert size={14} strokeWidth={1.9} aria-hidden />
                <span>{error}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <ul className="worldsave-notes">
              <li>
                <Archive size={13} strokeWidth={1.9} aria-hidden />
                {report?.backup
                  ? t('worldEdit.saveBackupTaken', { id: report.backup.id })
                  : t('worldEdit.saveBackupReused')}
              </li>
            </ul>
            {report && report.refused.length > 0 && (
              <div className="worldsave-callout warn">
                <TriangleAlert size={14} strokeWidth={1.9} aria-hidden />
                <div className="worldsave-refused">
                  <span>{t('worldEdit.saveRefused', { n: report.refused.length })}</span>
                  <ul>
                    {report.refused.slice(0, 6).map((r) => (
                      <li key={`${r.cx},${r.cz}`}>
                        <span className="worldsave-chunk">
                          {r.cx}, {r.cz}
                        </span>
                        {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
