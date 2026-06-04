// Settings ▸ Viewer: scene toggles (grid, block-texture icons, floor highlighting)
// and fly-mode controls (mouse sensitivity, invert Y). Mutates settingsStore; the
// viewer reads these via App's settings→viewer effect.
import { useSettings } from '../../hooks/useStores';
import { settingsStore } from '../../state/settings';

export function ViewerTab() {
  const settings = useSettings((s) => s);
  const set = settingsStore.getState().set;
  return (
    <>
      <section className="settings-group">
        <div className="settings-group-name">Scene</div>
        <label className="setting-row">
          <span className="setting-label">Show ground grid</span>
          <input type="checkbox" checked={settings.showGrid} onChange={(e) => set('showGrid', e.target.checked)} />
        </label>
        <label className="setting-row">
          <span className="setting-label">Block textures in the Info list</span>
          <input
            type="checkbox"
            checked={settings.blockTextureIcons}
            onChange={(e) => set('blockTextureIcons', e.target.checked)}
          />
        </label>
        <p className="setting-note">Show each block’s texture instead of a flat color swatch.</p>
        <label className="setting-row">
          <span className="setting-label">Only highlight floors while editing</span>
          <input
            type="checkbox"
            checked={settings.floorsOnlyWhenEditing}
            onChange={(e) => set('floorsOnlyWhenEditing', e.target.checked)}
          />
        </label>
        <p className="setting-note">
          When off, a build’s floor-plan regions stay highlighted in the viewer; when on, they only
          show while the Generate ▸ Floors section is open.
        </p>
      </section>
      <section className="settings-group">
        <div className="settings-group-name">Fly mode</div>
        <label className="setting-row">
          <span className="setting-label">Mouse sensitivity</span>
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
          <span className="setting-label">Invert Y axis</span>
          <input type="checkbox" checked={settings.invertY} onChange={(e) => set('invertY', e.target.checked)} />
        </label>
      </section>
    </>
  );
}
