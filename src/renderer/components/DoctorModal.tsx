// The Worldgen Doctor (File ▸ Workspace Check-Up…): every structure, pool, set, biome
// tag and pack.mcmeta of the active workspace scanned by main's rule set, each finding
// shown with a fix-it explanation — the "my pack silently doesn't load / never
// generates" class, caught before launching the game. Re-runs on open and on demand.
import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Stethoscope, TriangleAlert, XCircle } from 'lucide-react';
import type { WorkspaceDoctorReport } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { api } from '../api';
import { useApp, useT } from '../hooks/useStores';
import { store } from '../state/store';
import { Modal } from './ui/Modal';

export function DoctorModal() {
  const t = useT();
  const open = useApp((s) => s.doctorOpen);
  const [report, setReport] = useState<WorkspaceDoctorReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setReport(await api.workspaceDoctor());
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open) void run();
  }, [open]);

  if (!open) return null;
  const close = () => store.getState().setDoctorOpen(false);
  const errors = report?.findings.filter((f) => f.level === 'error') ?? [];
  const warnings = report?.findings.filter((f) => f.level === 'warning') ?? [];

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('doctor.title')}
      className="modal-lg doctor-modal"
      footer={
        <>
          <button className="btn" disabled={busy} onClick={() => void run()}>
            <RefreshCw size={14} strokeWidth={1.9} aria-hidden />
            {t('doctor.rerun')}
          </button>
          <button className="btn primary" onClick={close}>
            {t('doctor.close')}
          </button>
        </>
      }
    >
      {!report || busy ? (
        <p className="retheme-note">{t('doctor.running')}</p>
      ) : report.workspace === null ? (
        <p className="retheme-note">{t('doctor.noWorkspace')}</p>
      ) : (
        <>
          <div className="doctor-summary">
            <Stethoscope size={16} strokeWidth={1.9} aria-hidden />
            <span>
              {t('doctor.summary', { workspace: report.workspace, files: report.checkedFiles, errors: errors.length, warnings: warnings.length })}
            </span>
          </div>
          {report.findings.length === 0 ? (
            <div className="doctor-clear">
              <CheckCircle2 size={18} strokeWidth={1.9} aria-hidden />
              {t('doctor.allClear')}
            </div>
          ) : (
            <ul className="doctor-list">
              {[...errors, ...warnings].map((f, i) => (
                <li key={i} className={`doctor-item ${f.level}`}>
                  {f.level === 'error' ? (
                    <XCircle size={15} strokeWidth={1.9} aria-hidden />
                  ) : (
                    <TriangleAlert size={15} strokeWidth={1.9} aria-hidden />
                  )}
                  <div className="doctor-body">
                    <span className="doctor-file">{f.file}</span>
                    <span className="doctor-text">
                      {t(`doctor.issue.${f.code}` as MessageKey, f.detail ? { detail: f.detail } : undefined)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
