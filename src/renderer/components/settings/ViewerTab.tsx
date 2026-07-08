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
        <label className="setting-row">
          <span className="setting-label">{t('viewer.showGrid')}</span>
          <input type="checkbox" checked={settings.showGrid} onChange={(e) => set('showGrid', e.target.checked)} />
        </label>
        <label className="setting-row">
          <span className="setting-label">{t('viewer.blockTextures')}</span>
          <input
            type="checkbox"
            checked={settings.blockTextureIcons}
            onChange={(e) => set('blockTextureIcons', e.target.checked)}
          />
        </label>
        <p className="setting-note">{t('viewer.blockTexturesNote')}</p>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('viewer.structures')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('viewer.nbtLimit')}</span>
          <Select value={settings.nbtSizeLimit} options={nbtLimitOptions} onChange={(v) => set('nbtSizeLimit', v as NbtSizePref)} />
        </label>
        <p className="setting-note">{t('viewer.nbtLimitNote')}</p>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('viewer.overlays')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('viewer.overlayScheme')}</span>
          <Select
            value={settings.overlayScheme}
            options={[
              { value: 'default', label: t('viewer.overlayDefault') },
              { value: 'colorblind', label: t('viewer.overlayColorblind'), description: t('viewer.overlayColorblindDesc') },
            ]}
            onChange={(v) => set('overlayScheme', v as OverlayScheme)}
            ariaLabel={t('viewer.overlayScheme')}
          />
        </label>
        <label className="setting-row">
          <span className="setting-label">{t('viewer.ySliceRemember')}</span>
          <input
            type="checkbox"
            checked={settings.ySliceRemember}
            onChange={(e) => set('ySliceRemember', e.target.checked)}
          />
        </label>
        <p className="setting-note">{t('viewer.ySliceRememberNote')}</p>
        <label className="setting-row">
          <span className="setting-label">{t('viewer.cursorReadout')}</span>
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
        </label>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('settingsEditor.group')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('settingsEditor.defaultTool')}</span>
          <Select
            value={settings.editorDefaultTool}
            options={[
              { value: 'select', label: t('settingsEditor.toolSelect') },
              { value: 'paint', label: t('settingsEditor.toolPaint') },
            ]}
            onChange={(v) => set('editorDefaultTool', v as 'select' | 'paint')}
            ariaLabel={t('settingsEditor.defaultTool')}
          />
        </label>
        <label className="setting-row">
          <span className="setting-label">{t('settingsEditor.planeLock')}</span>
          <input
            type="checkbox"
            checked={settings.editorPlaneLock}
            onChange={(e) => set('editorPlaneLock', e.target.checked)}
          />
        </label>
        <p className="setting-note">{t('settingsEditor.planeLockNote')}</p>
        <label className="setting-row">
          <span className="setting-label">{t('settingsEditor.symmetryPersist')}</span>
          <input
            type="checkbox"
            checked={settings.editorSymmetryPersist}
            onChange={(e) => set('editorSymmetryPersist', e.target.checked)}
          />
        </label>
        <label className="setting-row">
          <span className="setting-label">{t('settingsEditor.undoDepth')}</span>
          <Stepper
            value={settings.editorUndoDepth}
            onChange={(v) => set('editorUndoDepth', Math.min(500, Math.max(10, Math.round(v))))}
            min={10}
            max={500}
            step={10}
            size="sm"
          />
        </label>
        <p className="setting-note">{t('settingsEditor.undoDepthNote')}</p>
        <label className="setting-row">
          <span className="setting-label">{t('settingsEditor.unsavedGuard')}</span>
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
        </label>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('settingsFiles.group')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('settingsFiles.exportFormat')}</span>
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
        </label>
        <label className="setting-row">
          <span className="setting-label">{t('settingsFiles.materialsFormat')}</span>
          <Select
            value={settings.materialsFormat}
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'json', label: 'JSON' },
            ]}
            onChange={(v) => set('materialsFormat', v as MaterialsFormat)}
            ariaLabel={t('settingsFiles.materialsFormat')}
          />
        </label>
        <label className="setting-row">
          <span className="setting-label">{t('settingsFiles.reopenSession')}</span>
          <input
            type="checkbox"
            checked={settings.reopenSession}
            onChange={(e) => set('reopenSession', e.target.checked)}
          />
        </label>
        <p className="setting-note">{t('settingsFiles.reopenSessionNote')}</p>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">{t('viewer.flyMode')}</div>
        <label className="setting-row">
          <span className="setting-label">{t('viewer.mouseSensitivity')}</span>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.05}
            value={settings.lookSensitivity}
            onChange={(e) => set('lookSensitivity', Number(e.target.value))}
          />
          <span className="setting-value">{settings.lookSensitivity.toFixed(2)}×</span>
        </label>
        <label className="setting-row">
          <span className="setting-label">{t('viewer.invertY')}</span>
          <input type="checkbox" checked={settings.invertY} onChange={(e) => set('invertY', e.target.checked)} />
        </label>
      </section>
    </>
  );
}
