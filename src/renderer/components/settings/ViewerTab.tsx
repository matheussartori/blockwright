// Settings ▸ Viewer: the content-pack folder, scene toggles (grid, block-texture
// icons), overlay/readout preferences, fly-mode controls (mouse sensitivity, invert Y),
// plus the EDITOR and FILES sections (the v2.2 additions — default tool / plane lock /
// symmetry persistence / undo depth / unsaved-edit guard, and the export-format +
// session-restore defaults). Mutates settingsStore; consumers read via their effects.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useSettings, useT } from '../../hooks/useStores';
import { settingsStore, type CursorReadout, type ExportFormatPref, type OverlayScheme, type UnsavedEditGuard } from '../../state/settings';
import { Select, type SelectOption } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { SettingRow, ToggleRow } from './rows';
import type { MaterialsFormat } from '@/shared/types';
import type { NbtSizePref } from '@/shared/domain/split';

export function ViewerTab() {
  const t = useT();
  const settings = useSettings((s) => s);
  const set = settingsStore.getState().set;

  const nbtLimitOptions: SelectOption[] = [
    { value: 'auto', label: t('viewer.nbtLimitAuto'), description: t('viewer.nbtLimitAutoDesc') },
    { value: '48', label: t('viewer.nbtLimit48'), description: t('viewer.nbtLimit48Desc') },
    { value: '32', label: t('viewer.nbtLimit32'), description: t('viewer.nbtLimit32Desc') },
  ];

  const [contentDir, setContentDir] = useState<string | null>(null);
  useEffect(() => {
    void api.getContentDir().then(setContentDir);
  }, []);
  const chooseContent = async () => {
    const picked = await api.chooseContentDir();
    if (picked) setContentDir(picked);
  };

  return (
    <>
      <section className="settings-group">
        <div className="settings-group-name">{t('viewer.contentPack')}</div>
        <p className="setting-note">{t('viewer.contentPackNote')}</p>
        <div className="setting-key-row">
          <input
            className="input setting-key-input"
            readOnly
            value={contentDir ?? ''}
            placeholder={t('viewer.contentPackNone')}
            spellCheck={false}
          />
          <button className="btn sm no-drag" onClick={() => void chooseContent()}>
            {t('viewer.contentPackChange')}
          </button>
          <button
            className="btn sm no-drag"
            onClick={() => contentDir && void api.revealPath(contentDir)}
            disabled={!contentDir}
          >
            {t('library.reveal')}
          </button>
        </div>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('viewer.scene')}</div>
        <ToggleRow label={t('viewer.showGrid')} checked={settings.showGrid} onChange={(v) => set('showGrid', v)} />
        <ToggleRow
          label={t('viewer.blockTextures')}
          checked={settings.blockTextureIcons}
          onChange={(v) => set('blockTextureIcons', v)}
        />
        <p className="setting-note">{t('viewer.blockTexturesNote')}</p>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('viewer.structures')}</div>
        <SettingRow label={t('viewer.nbtLimit')}>
          <Select
            value={settings.nbtSizeLimit}
            options={nbtLimitOptions}
            onChange={(v) => set('nbtSizeLimit', v as NbtSizePref)}
            ariaLabel={t('viewer.nbtLimit')}
          />
        </SettingRow>
        <p className="setting-note">{t('viewer.nbtLimitNote')}</p>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('viewer.overlays')}</div>
        <SettingRow label={t('viewer.overlayScheme')}>
          <Select
            value={settings.overlayScheme}
            options={[
              { value: 'default', label: t('viewer.overlayDefault') },
              { value: 'colorblind', label: t('viewer.overlayColorblind'), description: t('viewer.overlayColorblindDesc') },
            ]}
            onChange={(v) => set('overlayScheme', v as OverlayScheme)}
            ariaLabel={t('viewer.overlayScheme')}
          />
        </SettingRow>
        <ToggleRow
          label={t('viewer.ySliceRemember')}
          checked={settings.ySliceRemember}
          onChange={(v) => set('ySliceRemember', v)}
        />
        <p className="setting-note">{t('viewer.ySliceRememberNote')}</p>
        <SettingRow label={t('viewer.cursorReadout')}>
          <Select
            value={settings.cursorReadout}
            options={[
              { value: 'coords', label: t('viewer.cursorCoords') },
              { value: 'block', label: t('viewer.cursorBlock') },
              { value: 'biome', label: t('viewer.cursorBiome') },
            ]}
            onChange={(v) => set('cursorReadout', v as CursorReadout)}
            ariaLabel={t('viewer.cursorReadout')}
          />
        </SettingRow>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('settingsEditor.group')}</div>
        <SettingRow label={t('settingsEditor.defaultTool')}>
          <Select
            value={settings.editorDefaultTool}
            options={[
              { value: 'select', label: t('settingsEditor.toolSelect') },
              { value: 'paint', label: t('settingsEditor.toolPaint') },
            ]}
            onChange={(v) => set('editorDefaultTool', v as 'select' | 'paint')}
            ariaLabel={t('settingsEditor.defaultTool')}
          />
        </SettingRow>
        <ToggleRow
          label={t('settingsEditor.planeLock')}
          checked={settings.editorPlaneLock}
          onChange={(v) => set('editorPlaneLock', v)}
        />
        <p className="setting-note">{t('settingsEditor.planeLockNote')}</p>
        <ToggleRow
          label={t('settingsEditor.symmetryPersist')}
          checked={settings.editorSymmetryPersist}
          onChange={(v) => set('editorSymmetryPersist', v)}
        />
        <SettingRow label={t('settingsEditor.undoDepth')}>
          <Stepper
            value={settings.editorUndoDepth}
            onChange={(v) => set('editorUndoDepth', Math.min(500, Math.max(10, Math.round(v))))}
            min={10}
            max={500}
            step={10}
            size="sm"
            ariaLabel={t('settingsEditor.undoDepth')}
          />
        </SettingRow>
        <p className="setting-note">{t('settingsEditor.undoDepthNote')}</p>
        <SettingRow label={t('settingsEditor.unsavedGuard')}>
          <Select
            value={settings.editorUnsavedGuard}
            options={[
              { value: 'warn', label: t('settingsEditor.guardWarn') },
              { value: 'save', label: t('settingsEditor.guardSave'), description: t('settingsEditor.guardSaveDesc') },
              { value: 'discard', label: t('settingsEditor.guardDiscard') },
            ]}
            onChange={(v) => set('editorUnsavedGuard', v as UnsavedEditGuard)}
            ariaLabel={t('settingsEditor.unsavedGuard')}
          />
        </SettingRow>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('settingsFiles.group')}</div>
        <SettingRow label={t('settingsFiles.exportFormat')}>
          <Select
            value={settings.defaultExportFormat}
            options={[
              { value: 'nbt', label: '.nbt' },
              { value: 'schem', label: '.schem' },
              { value: 'litematic', label: '.litematic' },
            ]}
            onChange={(v) => set('defaultExportFormat', v as ExportFormatPref)}
            ariaLabel={t('settingsFiles.exportFormat')}
          />
        </SettingRow>
        <SettingRow label={t('settingsFiles.materialsFormat')}>
          <Select
            value={settings.materialsFormat}
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'json', label: 'JSON' },
            ]}
            onChange={(v) => set('materialsFormat', v as MaterialsFormat)}
            ariaLabel={t('settingsFiles.materialsFormat')}
          />
        </SettingRow>
        <ToggleRow
          label={t('settingsFiles.reopenSession')}
          checked={settings.reopenSession}
          onChange={(v) => set('reopenSession', v)}
        />
        <p className="setting-note">{t('settingsFiles.reopenSessionNote')}</p>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('viewer.flyMode')}</div>
        <SettingRow label={t('viewer.mouseSensitivity')}>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.05}
            value={settings.lookSensitivity}
            aria-label={t('viewer.mouseSensitivity')}
            onChange={(e) => set('lookSensitivity', Number(e.target.value))}
          />
          <span className="setting-value">{settings.lookSensitivity.toFixed(2)}×</span>
        </SettingRow>
        <ToggleRow label={t('viewer.invertY')} checked={settings.invertY} onChange={(v) => set('invertY', v)} />
      </section>
    </>
  );
}
