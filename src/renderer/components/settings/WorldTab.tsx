// Settings ▸ World: the world-editing MASTER SWITCH (off by default — worlds open read-only
// until the user opts in; the v2.2 safety latch), backup retention, and the backup manager for
// the open world (list / restore / delete — the backups themselves are enforced, only retention
// is configurable).
import { useCallback, useEffect, useState } from 'react';
import type { WorldBackupInfo } from '@/shared/types';
import { api } from '../../api';
import { useActiveDoc, useSettings, useT } from '../../hooks/useStores';
import { settingsStore } from '../../state/settings';
import { Stepper } from '../ui/Stepper';
import { Switch } from '../ui/Switch';

function fmtBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)} GB`;
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function WorldTab() {
  const t = useT();
  const settings = useSettings((s) => s);
  const set = settingsStore.getState().set;
  const activeDoc = useActiveDoc();
  const worldOpen = activeDoc?.kind === 'world' ? activeDoc.worldMeta : null;

  const [backups, setBackups] = useState<WorldBackupInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (!worldOpen) {
      setBackups(null);
      return;
    }
    void api
      .listWorldBackups()
      .then(setBackups)
      .catch(() => setBackups([]));
  }, [worldOpen]);
  useEffect(refresh, [refresh]);

  const restore = async (id: string) => {
    setBusy(id);
    try {
      await api.restoreWorldBackup(id);
    } finally {
      setBusy(null);
    }
  };
  const remove = async (id: string) => {
    setBusy(id);
    try {
      setBackups(await api.deleteWorldBackup(id));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="settings-group">
        <div className="settings-group-name">{t('settingsWorld.editingGroup')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('settingsWorld.enableEditing')}</span>
          <Switch checked={settings.worldEditing} onChange={(v) => set('worldEditing', v)} />
        </label>
        <p className="setting-note">{t('settingsWorld.enableEditingNote')}</p>
      </section>

      <section className="settings-group">
        <div className="settings-group-name">{t('settingsWorld.backupsGroup')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('settingsWorld.retention')}</span>
          <Stepper
            value={settings.worldBackupRetention}
            onChange={(v) => set('worldBackupRetention', Math.max(0, Math.round(v)))}
            min={0}
            max={100}
            step={1}
            size="sm"
          />
        </label>
        <p className="setting-note">{t('settingsWorld.retentionNote')}</p>

        {!worldOpen ? (
          <p className="setting-note">{t('settingsWorld.noWorld')}</p>
        ) : (
          <>
            <p className="setting-note">{t('settingsWorld.backupsFor', { name: worldOpen.name })}</p>
            {backups && backups.length === 0 && <p className="setting-note">{t('settingsWorld.noBackups')}</p>}
            {backups?.map((b) => (
              <div className="setting-row" key={b.id}>
                <span className="setting-label" style={{ fontFamily: 'var(--mono)' }}>
                  {new Date(b.createdMs).toLocaleString()}{' '}
                  <span className="setting-note-inline">
                    · {b.files.length} {t('settingsWorld.filesLabel')} · {fmtBytes(b.bytes)}
                  </span>
                </span>
                <span>
                  <button className="btn sm" disabled={busy !== null} onClick={() => void restore(b.id)}>
                    {busy === b.id ? '…' : t('settingsWorld.restore')}
                  </button>{' '}
                  <button className="btn sm" disabled={busy !== null} onClick={() => void remove(b.id)}>
                    {t('settingsWorld.delete')}
                  </button>
                </span>
              </div>
            ))}
          </>
        )}
      </section>
    </>
  );
}
