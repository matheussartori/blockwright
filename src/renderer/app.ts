// Application orchestration for the renderer: wires UI controls and the file
// open/load flow to the 3D viewer and the inspector/status panels.
import type { Viewer } from './viewer/viewer';
import type { Workspace } from '@/shared/types';
import type { Shell } from './ui/shell';
import { escapeHtml } from './ui/html';
import { basename, dirname } from './ui/path';
import { renderInspector } from './ui/inspector';
import { renderStatus, setStatus } from './ui/statusbar';

const api = window.blockwright;

export class App {
  private recents: string[] = [];

  constructor(
    private shell: Shell,
    private viewer: Viewer,
  ) {
    this.wire();
    this.probeContent();
    void this.initRecents();
    void this.initWorkspace();
  }

  private async initWorkspace() {
    this.renderWorkspace(await api.getWorkspace());
  }

  private wire() {
    for (const btn of this.shell.openButtons) {
      btn.addEventListener('click', () => this.open());
    }
    this.shell.recentsClear.addEventListener('click', () => this.clearRecents());
    this.shell.openWorkspaceButton.addEventListener('click', () => api.openWorkspace());

    api.onOpenPath((path) => this.load(path));
    api.onFileDrop((path) => this.load(path));
    // Recents are owned by main (and mutated by the native File menu too), so the
    // welcome list always re-renders from the broadcast rather than local state.
    api.onRecentsChanged((paths) => {
      this.recents = paths;
      this.renderRecents();
    });
    // Workspace is owned by main (File menu or welcome button); the badge tracks it.
    api.onWorkspaceChanged((ws) => this.renderWorkspace(ws));
  }

  /** Show/hide the bottom-left workspace badge with the project name. */
  private renderWorkspace(ws: Workspace | null) {
    const badge = this.shell.workspaceBadge;
    if (!ws) {
      badge.classList.add('hidden');
      badge.innerHTML = '';
      return;
    }
    badge.classList.remove('hidden');
    badge.innerHTML = `
      <span class="ws-dot"></span>
      <span class="ws-label">Workspace</span>
      <span class="ws-name">${escapeHtml(ws.name)}</span>`;
    badge.title = `${ws.namespace} · ${ws.root}`;
  }

  private async open() {
    const path = await api.openDialog();
    if (path) this.load(path);
  }

  private async load(path: string) {
    const { loading, emptyState, inspector, statusbar } = this.shell;

    // A recent file may have been moved or deleted since it was opened.
    if (!(await api.pathExists(path))) {
      api.removeRecent(path); // main broadcasts the new list, which re-renders the welcome view
      setStatus(
        statusbar,
        `<span class="warn">${escapeHtml(basename(path))} no longer exists — removed from Recent</span>`,
      );
      return;
    }

    loading.classList.remove('hidden');
    try {
      const data = await api.loadStructure(path);
      api.addRecent(path);
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

  private async initRecents() {
    this.recents = await api.listRecents();
    this.renderRecents();
  }

  private clearRecents() {
    api.clearRecents(); // main broadcasts the empty list, which re-renders the welcome view
  }

  /** Render the recents list on the welcome screen (hidden when empty). */
  private renderRecents() {
    const { recents, recentsList } = this.shell;
    if (this.recents.length === 0) {
      recents.classList.add('hidden');
      recentsList.innerHTML = '';
      return;
    }
    recents.classList.remove('hidden');
    recentsList.innerHTML = this.recents
      .map(
        (p) => `<li class="recent-row" title="${escapeHtml(p)}">
          <span class="recent-name">${escapeHtml(basename(p))}</span>
          <span class="recent-path">${escapeHtml(dirname(p))}</span>
        </li>`,
      )
      .join('');
    recentsList.querySelectorAll<HTMLElement>('.recent-row').forEach((row, i) => {
      row.addEventListener('click', () => this.load(this.recents[i]));
    });
  }

  /** Hint on the empty state whether a content pack is available. */
  private async probeContent() {
    const hint = this.shell.contentHint;
    if (!hint) return;
    const present = await api.hasTexture('minecraft/block/stone');
    hint.textContent = present
      ? '✓ Content pack detected — full textures available'
      : 'No content pack found — blocks will render as flat colors';
  }
}
