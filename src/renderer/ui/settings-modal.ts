// The Settings panel: a modal overlay that edits the persisted settings store.
// It only mutates `settingsStore`; applying the values to the viewer happens in
// one place (app.ts), so settings take effect whether or not this panel is open.
import { settingsStore, watchSettings, type Settings } from '../state/settings';

const TEMPLATE = `
  <div class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
    <header class="settings-head">
      <h2>Settings</h2>
      <button class="settings-close" type="button" title="Close" aria-label="Close">✕</button>
    </header>
    <div class="settings-body">
      <section class="settings-group">
        <div class="settings-group-name">Fly mode</div>
        <label class="setting-row">
          <span class="setting-label">Mouse sensitivity</span>
          <input type="range" min="0.2" max="3" step="0.05" data-setting="lookSensitivity">
          <span class="setting-value" data-value="lookSensitivity"></span>
        </label>
        <label class="setting-row">
          <span class="setting-label">Invert Y axis</span>
          <input type="checkbox" data-setting="invertY">
        </label>
      </section>
      <section class="settings-group">
        <div class="settings-group-name">Viewer</div>
        <label class="setting-row">
          <span class="setting-label">Show grid</span>
          <input type="checkbox" data-setting="showGrid">
        </label>
      </section>
    </div>
    <footer class="settings-foot">
      <button class="link settings-reset" type="button">Reset to defaults</button>
    </footer>
  </div>
`;

export interface SettingsModal {
  open: () => void;
  close: () => void;
}

/** Build the Settings overlay, wire it to the store, and return open/close. */
export function mountSettingsModal(): SettingsModal {
  const overlay = document.createElement('div');
  overlay.className = 'settings-overlay hidden';
  overlay.innerHTML = TEMPLATE;
  document.body.appendChild(overlay);

  const state = settingsStore.getState();
  const inputs = overlay.querySelectorAll<HTMLInputElement>('input[data-setting]');

  // Inputs write to the store; numbers come back as `number`, checkboxes as `boolean`.
  for (const input of inputs) {
    const key = input.dataset.setting as keyof Settings;
    input.addEventListener('input', () => {
      const value = input.type === 'checkbox' ? input.checked : Number(input.value);
      state.set(key, value as Settings[typeof key]);
    });
  }

  overlay.querySelector<HTMLElement>('.settings-reset')!
    .addEventListener('click', () => state.reset());
  overlay.querySelector<HTMLElement>('.settings-close')!
    .addEventListener('click', () => close());
  // Clicking the dimmed backdrop (but not the panel) closes.
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });

  // Keep the inputs in sync with the store (covers Reset and external changes).
  watchSettings((s) => {
    for (const input of inputs) {
      const key = input.dataset.setting as keyof Settings;
      if (input.type === 'checkbox') input.checked = s[key] as boolean;
      else input.value = String(s[key]);
    }
    overlay.querySelectorAll<HTMLElement>('.setting-value[data-value]').forEach((el) => {
      const key = el.dataset.value as keyof Settings;
      el.textContent = `${(s[key] as number).toFixed(2)}×`;
    });
  });

  // While open, swallow keys so viewer shortcuts (F to fly, WASD) stay inert and
  // Escape closes the panel instead of doing nothing.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    // Let keys reach the panel's own inputs; block everything else so viewer
    // shortcuts (F to fly, WASD) stay inert while Settings is open.
    if (!overlay.contains(e.target as Node)) e.stopPropagation();
  };

  function open() {
    if (!overlay.classList.contains('hidden')) return;
    overlay.classList.remove('hidden');
    window.addEventListener('keydown', onKeyDown, true);
  }

  function close() {
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    window.removeEventListener('keydown', onKeyDown, true);
  }

  return { open, close };
}
