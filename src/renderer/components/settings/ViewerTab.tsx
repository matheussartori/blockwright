// Settings ▸ Viewer: the content-pack folder, scene toggles (grid, block-texture
// icons) and fly-mode controls (mouse sensitivity, invert Y). Mutates settingsStore;
// the viewer reads these via App's settings→viewer effect. (Floor bands are
// auto-detected, not a setting.)
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useSettings, useT } from '../../hooks/useStores';
import { settingsStore } from '../../state/settings';
import { Select, type SelectOption } from '../ui/Select';
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
