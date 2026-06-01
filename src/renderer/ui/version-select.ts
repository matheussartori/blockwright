// One-shot modal asking which Minecraft version a workspace targets, shown only
// when auto-detection failed. Resolves with the chosen version, or null if the
// user dismisses it (jigsaw features then stay off until a version is known).
import { SELECTABLE_VERSIONS } from '@/shared/mc-version';
import { escapeHtml } from './html';

export function promptVersionSelect(workspaceName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.innerHTML = `
      <div class="settings-modal version-modal" role="dialog" aria-modal="true" aria-label="Select Minecraft version">
        <header class="settings-head">
          <h2>Minecraft version</h2>
          <button class="settings-close" type="button" title="Close" aria-label="Close">✕</button>
        </header>
        <div class="settings-body">
          <p class="version-hint">Couldn't detect the Minecraft version for
            <strong>${escapeHtml(workspaceName)}</strong>. Pick it so jigsaw
            previews resolve correctly.</p>
          <div class="version-grid">
            ${SELECTABLE_VERSIONS.map(
              (v) => `<button class="btn version-option" data-version="${escapeHtml(v)}">${escapeHtml(v)}</button>`,
            ).join('')}
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const done = (value: string | null) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(null);
      }
    };
    window.addEventListener('keydown', onKey, true);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) done(null);
    });
    overlay.querySelector<HTMLElement>('.settings-close')!.addEventListener('click', () => done(null));
    overlay.querySelectorAll<HTMLElement>('.version-option').forEach((btn) => {
      btn.addEventListener('click', () => done(btn.dataset.version ?? null));
    });
  });
}
