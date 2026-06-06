// Settings ▸ Viewer: scene toggles (grid, block-texture icons, floor highlighting)
// and fly-mode controls (mouse sensitivity, invert Y). Mutates settingsStore; the
// viewer reads these via App's settings→viewer effect.
import { useSettings, useT } from '../../hooks/useStores';
import { settingsStore } from '../../state/settings';

export function ViewerTab() {
  const t = useT();
  const settings = useSettings((s) => s);
  const set = settingsStore.getState().set;
  return (
    <>
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
        <label className="setting-row">
          <span className="setting-label">{t('viewer.floorsOnlyEditing')}</span>
          <input
            type="checkbox"
            checked={settings.floorsOnlyWhenEditing}
            onChange={(e) => set('floorsOnlyWhenEditing', e.target.checked)}
          />
        </label>
        <p className="setting-note">{t('viewer.floorsOnlyEditingNote')}</p>
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
