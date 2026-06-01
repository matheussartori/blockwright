// Application orchestration for the renderer: wires UI controls and the file
// open/load flow to the 3D viewer and the inspector/status panels.
import type { Viewer } from './viewer/viewer';
import type { Shell } from './ui/shell';
import { escapeHtml } from './ui/html';
import { renderInspector } from './ui/inspector';
import { renderStatus, setStatus } from './ui/statusbar';

const api = window.blockwright;

export class App {
  constructor(
    private shell: Shell,
    private viewer: Viewer,
  ) {
    this.wire();
    this.probeContent();
  }

  private wire() {
    for (const btn of this.shell.openButtons) {
      btn.addEventListener('click', () => this.open());
    }
    api.onOpenPath((path) => this.load(path));
    api.onFileDrop((path) => this.load(path));
  }

  private async open() {
    const path = await api.openDialog();
    if (path) this.load(path);
  }

  private async load(path: string) {
    const { loading, emptyState, inspector, statusbar } = this.shell;
    loading.classList.remove('hidden');
    try {
      const data = await api.loadStructure(path);
      if (data.blocks.length === 0) {
        setStatus(statusbar, `<span class="warn">${escapeHtml(data.name)} — no structure blocks found</span>`);
      } else {
        await this.viewer.show(data);
        emptyState.classList.add('hidden');
        renderInspector(inspector, data);
        renderStatus(statusbar, data);
      }
    } catch (err) {
      setStatus(statusbar, `<span class="warn">Failed to open: ${escapeHtml(String(err))}</span>`);
    } finally {
      loading.classList.add('hidden');
    }
  }

  /** Hint on the empty state whether a content pack is available. */
  private async probeContent() {
    const hint = this.shell.contentHint;
    if (!hint) return;
    const present = await api.hasTexture('block/stone');
    hint.textContent = present
      ? '✓ Content pack detected — full textures available'
      : 'No content pack found — blocks will render as flat colors';
  }
}
