// Settings ▸ World: the world-editing MASTER SWITCH (off by default — worlds open read-only
// until the user opts in; the v2.2 safety latch), backup retention + total-size cap and the
// backup manager for the open world (list / restore / delete — the backups themselves are
// enforced, only retention is configurable), plus the streaming budget (default render
// distance, resident chunk cap, mesh worker threads) and the default dimension on open.
import { useCallback, useEffect, useState } from 'react';
import type { WorldBackupInfo } from '@/shared/types';
import { api } from '../../api';
import { useActiveDoc, useSettings, useT } from '../../hooks/useStores';
import { settingsStore } from '../../state/settings';
import { Select } from '../ui/Select';
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
        <div className="settings-group-name">{t('settingsWorld.streamingGroup')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('settingsWorld.renderDistance')}</span>
          <Stepper
            value={settings.worldRenderDistance}
            onChange={(v) => set('worldRenderDistance', Math.min(32, Math.max(4, Math.round(v))))}
            min={4}
            max={32}
            step={2}
            size="sm"
            unit="ch"
          />
        </label>
        <label className="setting-row">
          <span className="setting-label">{t('settingsWorld.chunkCap')}</span>
          <Stepper
            value={settings.worldChunkCap}
            onChange={(v) => set('worldChunkCap', Math.min(6000, Math.max(200, Math.round(v))))}
            min={200}
            max={6000}
            step={100}
            size="sm"
          />
        </label>
        <p className="setting-note">{t('settingsWorld.chunkCapNote')}</p>
        <label className="setting-row">
          <span className="setting-label">{t('settingsWorld.meshWorkers')}</span>
          <Stepper
            value={settings.worldMeshWorkers}
            onChange={(v) => set('worldMeshWorkers', Math.min(8, Math.max(0, Math.round(v))))}
            min={0}
            max={8}
            step={1}
            size="sm"
          />
        </label>
        <p className="setting-note">{t('settingsWorld.meshWorkersNote')}</p>
        <label className="setting-row">
          <span className="setting-label">{t('settingsWorld.defaultDimension')}</span>
          <Select
            value={settings.worldDefaultDimension}
            options={[
              { value: 'last', label: t('settingsWorld.dimLast') },
              { value: 'overworld', label: t('settingsWorld.dimOverworld') },
            ]}
            onChange={(v) => set('worldDefaultDimension', v as 'last' | 'overworld')}
            ariaLabel={t('settingsWorld.defaultDimension')}
          />
        </label>
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
        <label className="setting-row">
          <span className="setting-label">{t('settingsWorld.sizeCap')}</span>
          <Stepper
            value={settings.worldBackupSizeCapMb}
            onChange={(v) => set('worldBackupSizeCapMb', Math.max(0, Math.round(v)))}
            min={0}
            max={10240}
            step={128}
            size="sm"
            unit="MB"
          />
        </label>
        <p className="setting-note">{t('settingsWorld.sizeCapNote')}</p>

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
