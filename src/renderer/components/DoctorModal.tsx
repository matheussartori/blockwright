// The Worldgen Doctor (File ▸ Workspace Check-Up…): every structure, pool, set, biome
// tag and pack.mcmeta of the active workspace scanned by main's rule set, each finding
// shown with a fix-it explanation — the "my pack silently doesn't load / never
// generates" class, caught before launching the game. Re-runs on open and on demand.
// SAFE findings carry a one-click "Fix it" (folder rename / spawn_overrides / format
// re-stamp), and the footer's "Upgrade pack…" runs the whole datapack upgrader —
// re-stamp DataVersions, rename the structure folder, update pack.mcmeta — and shows
// its LOSS REPORT (every change + everything it couldn't map) in place of the findings.
// "Downgrade copies…" (v2.3 §1.4) is the mirror: pick an older target, get suffixed
// COPIES (originals untouched) with renamed ids undone and newer blocks substituted.
import { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, RefreshCw, Stethoscope, TriangleAlert, Wrench, XCircle } from 'lucide-react';
import type { UpgradeEntry, WorkspaceDoctorReport, WorkspaceUpgradeReport } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { SELECTABLE_VERSIONS } from '@/shared/mc-version';
import { api } from '../api';
import { useApp, useT } from '../hooks/useStores';
import { store } from '../state/store';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';

/** Finding codes with a SAFE one-click fix (mirrors main's FIXABLE_CODES). */
const FIXABLE = new Set(['wrong_folder', 'missing_spawn_overrides', 'stale_format']);

export function DoctorModal() {
  const t = useT();
  const open = useApp((s) => s.doctorOpen);
  const [report, setReport] = useState<WorkspaceDoctorReport | null>(null);
  const [upgrade, setUpgrade] = useState<WorkspaceUpgradeReport | null>(null);
  const [downgrade, setDowngrade] = useState<{ target: string; written: number; checkedFiles: number; entries: UpgradeEntry[] } | null>(null);
  const [downTarget, setDownTarget] = useState('1.21.1');
  const [busy, setBusy] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setUpgrade(null);
    setDowngrade(null);
    setFixError(null);
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

  const applyFix = async (code: string, file: string) => {
    setFixing(`${code}:${file}`);
    setFixError(null);
    try {
      const result = await api.workspaceDoctorFix(code, file);
      if (!result.ok) {
        setFixError(result.error);
        return;
      }
      await run(); // re-scan so the finding disappears (and any follow-ups surface)
    } finally {
      setFixing(null);
    }
  };

  const runUpgrade = async () => {
    setBusy(true);
    setFixError(null);
    setDowngrade(null);
    try {
      setUpgrade(await api.workspaceUpgrade());
      setReport(await api.workspaceDoctor()); // the summary reflects the upgraded pack
    } finally {
      setBusy(false);
    }
  };

  // The downgrader never touches originals (it writes suffixed copies), so the doctor
  // summary doesn't need a re-scan — only the loss report is shown.
  const runDowngrade = async () => {
    setBusy(true);
    setFixError(null);
    setUpgrade(null);
    try {
      setDowngrade(await api.workspaceDowngrade(downTarget));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('doctor.title')}
      className="modal-lg doctor-modal"
      footer={
        <>
          <button className="btn" disabled={busy || report?.workspace == null} onClick={() => void runUpgrade()}>
            <ArrowUpCircle size={14} strokeWidth={1.9} aria-hidden />
            {t('doctor.upgrade')}
          </button>
          <div className="doctor-downgrade-target">
            <Select
              value={downTarget}
              options={SELECTABLE_VERSIONS.map((v) => ({ value: v, label: v }))}
              onChange={setDownTarget}
            />
          </div>
          <button className="btn" disabled={busy || report?.workspace == null} onClick={() => void runDowngrade()}>
            <ArrowDownCircle size={14} strokeWidth={1.9} aria-hidden />
            {t('doctor.downgrade')}
          </button>
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
          {fixError && <p className="doctor-fix-error">{t('doctor.fixFailed', { error: fixError })}</p>}
          {downgrade && (
            <div className="doctor-upgrade">
              <div className="doctor-upgrade-head">
                {t('doctor.downgradeSummary', {
                  target: downgrade.target,
                  files: downgrade.checkedFiles,
                  written: downgrade.written,
                  losses: downgrade.entries.filter((e) => e.kind === 'loss').length,
                })}
              </div>
              {downgrade.entries.length === 0 ? (
                <p className="retheme-note">{t('doctor.downgradeClean')}</p>
              ) : (
                <ul className="doctor-list">
                  {downgrade.entries.map((e, i) => (
                    <li key={i} className={`doctor-item ${e.kind === 'loss' ? 'warning' : 'changed'}`}>
                      {e.kind === 'loss' ? (
                        <TriangleAlert size={15} strokeWidth={1.9} aria-hidden />
                      ) : (
                        <CheckCircle2 size={15} strokeWidth={1.9} aria-hidden />
                      )}
                      <div className="doctor-body">
                        <span className="doctor-file">{e.file}</span>
                        <span className="doctor-text">
                          {t(`downgrade.entry.${e.code}` as MessageKey, e.detail ? { detail: e.detail } : undefined)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {upgrade && (
            <div className="doctor-upgrade">
              <div className="doctor-upgrade-head">
                {t('doctor.upgradeSummary', {
                  target: upgrade.target ?? '?',
                  files: upgrade.checkedFiles,
                  changed: upgrade.entries.filter((e) => e.kind === 'changed').length,
                  losses: upgrade.entries.filter((e) => e.kind === 'loss').length,
                })}
              </div>
              {upgrade.entries.length === 0 ? (
                <p className="retheme-note">{t('doctor.upgradeClean')}</p>
              ) : (
                <ul className="doctor-list">
                  {upgrade.entries.map((e, i) => (
                    <li key={i} className={`doctor-item ${e.kind === 'loss' ? 'warning' : 'changed'}`}>
                      {e.kind === 'loss' ? (
                        <TriangleAlert size={15} strokeWidth={1.9} aria-hidden />
                      ) : (
                        <CheckCircle2 size={15} strokeWidth={1.9} aria-hidden />
                      )}
                      <div className="doctor-body">
                        <span className="doctor-file">{e.file}</span>
                        <span className="doctor-text">
                          {t(`upgrade.entry.${e.code}` as MessageKey, e.detail ? { detail: e.detail } : undefined)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                  {FIXABLE.has(f.code) && (
                    <button
                      className="btn sm doctor-fix-btn"
                      disabled={fixing !== null}
                      onClick={() => void applyFix(f.code, f.file)}
                    >
                      <Wrench size={13} strokeWidth={1.9} aria-hidden />
                      {fixing === `${f.code}:${f.file}` ? t('doctor.fixing') : t('doctor.fix')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
