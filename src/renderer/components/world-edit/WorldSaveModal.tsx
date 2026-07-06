// The "Save to World" dialog — the preview-then-write discipline, pointed at terrain: BEFORE a
// byte moves it lists exactly what will happen (blocks / chunks / regions, the enforced backup,
// the relight note), and AFTER the write it reports what actually happened, including per-chunk
// refusals (a proto chunk is refused, never "best-effort" written). Exiting with pending edits
// routes here too, so discarding is always an explicit choice.
import { useMemo, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { useSettings, useT, useWorldEdit } from '../../hooks/useStores';
import { worldEditStore } from '../../state/world-edit';
import { chunkKeyOf } from '../../world/edit-overlay';
import { Modal } from '../ui/Modal';

export function WorldSaveModal() {
  const t = useT();
  const open = useWorldEdit((s) => s.saveOpen);
  const pending = useWorldEdit((s) => s.pending);
  const pendingCount = useWorldEdit((s) => s.pendingCount);
  const saving = useWorldEdit((s) => s.saving);
  const report = useWorldEdit((s) => s.lastReport);
  const error = useWorldEdit((s) => s.error);
  const lockExclusive = useWorldEdit((s) => s.lockExclusive);
  const retention = useSettings((s) => s.worldBackupRetention);
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

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : close}
      title={t('worldEdit.saveTitle')}
      className="modal-sm"
      footer={
        done ? (
          <button className="btn primary" onClick={close}>
            {t('worldEdit.done')}
          </button>
        ) : (
          <>
            {pendingCount > 0 && (
              <button
                className="btn"
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
                  .save(retention)
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
      {!done ? (
        <div className="worldsave-body">
          <p>{t('worldEdit.savePlan', { blocks: pendingCount.toLocaleString(), chunks: plan.chunks, regions: plan.regions })}</p>
          <ul className="worldsave-notes">
            <li>{t('worldEdit.saveBackupNote')}</li>
            <li>{t('worldEdit.saveRelightNote')}</li>
            {retention > 0 && <li>{t('worldEdit.saveRetentionNote', { n: retention })}</li>}
          </ul>
          {!lockExclusive && (
            <p className="worldsave-warn">
              <AlertTriangle size={14} aria-hidden /> {t('worldEdit.lockCautionDesc')}
            </p>
          )}
          {error && <p className="worldsave-warn">{error}</p>}
        </div>
      ) : (
        <div className="worldsave-body">
          <p>
            <Check size={14} aria-hidden />{' '}
            {t('worldEdit.saveResult', {
              blocks: (report?.changedBlocks ?? 0).toLocaleString(),
              chunks: report?.editedChunks.length ?? 0,
              regions: report?.regions.length ?? 0,
            })}
          </p>
          {report?.backup ? (
            <p className="worldsave-note">{t('worldEdit.saveBackupTaken', { id: report.backup.id })}</p>
          ) : (
            <p className="worldsave-note">{t('worldEdit.saveBackupReused')}</p>
          )}
          {report && report.refused.length > 0 && (
            <div className="worldsave-warn">
              <p>{t('worldEdit.saveRefused', { n: report.refused.length })}</p>
              <ul className="worldsave-notes">
                {report.refused.slice(0, 6).map((r) => (
                  <li key={`${r.cx},${r.cz}`}>
                    <span style={{ fontFamily: 'var(--mono)' }}>
                      {r.cx},{r.cz}
                    </span>{' '}
                    — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
