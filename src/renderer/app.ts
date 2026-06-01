// Application orchestration for the renderer: wires UI controls and the file
// open/load flow to the 3D viewer and the inspector/status panels. State lives
// in the Zustand store (`./state/store`); IPC callbacks push into it and the UI
// subscribes to the slices it renders, so data flow stays one-directional.
import type { Viewer } from './viewer/viewer';
import type { StructureData, Workspace } from '@/shared/types';
import type { Shell } from './ui/shell';
import { store, watch } from './state/store';
import { escapeHtml } from './ui/html';
import { basename, dirname } from './ui/path';
import { clearInspector, renderInspector } from './ui/inspector';
import { renderStatus, resetStatus, setStatus } from './ui/statusbar';

const api = window.blockwright;

export class App {
  private readonly state = store.getState();

  constructor(
    private shell: Shell,
    private viewer: Viewer,
  ) {
    this.wire();
    this.bindViews();
    this.probeContent();
    void this.initRecents();
    void this.initWorkspace();
    void this.initRecentWorkspaces();
  }

  /** Push events into the store and hook up the controls. */
  private wire() {
    for (const btn of this.shell.openButtons) {
      btn.addEventListener('click', () => this.open());
    }
    this.shell.recentsClear.addEventListener('click', () => this.clearRecents());
    this.shell.recentWorkspacesClear.addEventListener('click', () => api.clearRecentWorkspaces());
    this.shell.openWorkspaceButton.addEventListener('click', () => api.openWorkspace());

    api.onOpenPath((path) => this.load(path));
    api.onFileDrop((path) => this.load(path));
    api.onCloseStructure(() => this.close());
    // Recents and workspace are owned by main (and mutated by the native File
    // menu too), so we mirror the broadcasts into the store rather than keeping
    // a second authoritative copy here.
    api.onRecentsChanged((paths) => this.state.setRecents(paths));
    api.onRecentWorkspacesChanged((list) => this.state.setRecentWorkspaces(list));
    api.onWorkspaceChanged((ws) => {
      this.state.setWorkspace(ws);
      void this.refreshWorkspaceStructures();
      this.hideSuggest(); // a workspace decision was made (opened or closed)
      // Closing a workspace returns to welcome — the open structure may depend
      // on its assets, and you've left that project's context.
      if (ws === null) this.close();
    });
  }

  /** Subscribe each UI piece to the one slice of state it renders. */
  private bindViews() {
    watch((s) => s.recents, (recents) => this.renderRecents(recents));
    watch((s) => s.workspace, (ws) => this.renderWorkspace(ws));
    watch((s) => s.recentWorkspaces, (list) => this.renderRecentWorkspaces(list));
    watch((s) => s.workspaceStructures, (paths) => this.renderWorkspaceStructures(paths));
    watch((s) => s.loading, (loading) => this.shell.loading.classList.toggle('hidden', !loading));
    watch((s) => s.structure, (structure) => {
      const open = structure !== null;
      this.shell.emptyState.classList.toggle('hidden', open);
      api.setFileOpen(open); // keep the native Close File item enabled/disabled in sync
    });
  }

  private async initWorkspace() {
    this.state.setWorkspace(await api.getWorkspace());
    await this.refreshWorkspaceStructures();
  }

  private async refreshWorkspaceStructures() {
    this.state.setWorkspaceStructures(await api.listWorkspaceStructures());
  }

  /** Render the active workspace's structures on the welcome screen. */
  private renderWorkspaceStructures(paths: string[]) {
    const { workspaceStructures, workspaceStructuresHead, workspaceStructuresList } = this.shell;
    if (paths.length === 0) {
      workspaceStructures.classList.add('hidden');
      workspaceStructuresList.innerHTML = '';
      return;
    }
    workspaceStructures.classList.remove('hidden');
    workspaceStructuresHead.textContent = `Workspace structures · ${paths.length}`;
    workspaceStructuresList.innerHTML = paths
      .map(
        (p) => `<li class="recent-row" title="${escapeHtml(p)}">
          <span class="recent-name">${escapeHtml(basename(p))}</span>
        </li>`,
      )
      .join('');
    workspaceStructuresList.querySelectorAll<HTMLElement>('.recent-row').forEach((row, i) => {
      row.addEventListener('click', () => this.load(paths[i]));
    });
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

  /** Tear down the current structure and return to the welcome screen. Idempotent. */
  private close() {
    this.hideSuggest();
    if (store.getState().structure === null) return;
    this.viewer.clear();
    this.state.setStructure(null);
    clearInspector(this.shell.inspector);
    resetStatus(this.shell.statusbar);
  }

  private async load(path: string) {
    const { inspector, statusbar } = this.shell;

    // A recent file may have been moved or deleted since it was opened.
    if (!(await api.pathExists(path))) {
      api.removeRecent(path); // main broadcasts the new list, which re-renders the welcome view
      setStatus(
        statusbar,
        `<span class="warn">${escapeHtml(basename(path))} no longer exists — removed from Recent</span>`,
      );
      return;
    }

    this.state.setLoading(true);
    try {
      const data: StructureData = await api.loadStructure(path);
      api.addRecent(path);
      if (data.blocks.length === 0) {
        setStatus(statusbar, `<span class="warn">${escapeHtml(data.name)} — no structure blocks found</span>`);
      } else {
        await this.viewer.show(data);
        this.state.setStructure(data);
        renderInspector(inspector, data);
        renderStatus(statusbar, data);
        void this.maybeSuggestWorkspace(path);
      }
    } catch (err) {
      setStatus(statusbar, `<span class="warn">Failed to open: ${escapeHtml(String(err))}</span>`);
    } finally {
      this.state.setLoading(false);
    }
  }

  private async initRecents() {
    this.state.setRecents(await api.listRecents());
  }

  private async initRecentWorkspaces() {
    this.state.setRecentWorkspaces(await api.listRecentWorkspaces());
  }

  private clearRecents() {
    api.clearRecents(); // main broadcasts the empty list, which re-renders the welcome view
  }

  /** Render the recent-workspaces list on the welcome screen (hidden when empty). */
  private renderRecentWorkspaces(list: Workspace[]) {
    const { recentWorkspaces, recentWorkspacesList } = this.shell;
    if (list.length === 0) {
      recentWorkspaces.classList.add('hidden');
      recentWorkspacesList.innerHTML = '';
      return;
    }
    recentWorkspaces.classList.remove('hidden');
    recentWorkspacesList.innerHTML = list
      .map(
        (ws) => `<li class="recent-row" title="${escapeHtml(`${ws.namespace} · ${ws.root}`)}">
          <span class="recent-name">${escapeHtml(ws.name)}</span>
          <span class="recent-path">${escapeHtml(ws.namespace)}</span>
        </li>`,
      )
      .join('');
    recentWorkspacesList.querySelectorAll<HTMLElement>('.recent-row').forEach((row, i) => {
      row.addEventListener('click', () => void api.activateWorkspace(list[i]));
    });
  }

  // --- Detected-workspace suggestion -----------------------------------------

  /** When a loose `.nbt` from a mod is opened without an active workspace, offer
   *  to load that workspace (so its textures resolve). No-op if one is active. */
  private async maybeSuggestWorkspace(filePath: string) {
    if (store.getState().workspace !== null) return;
    const ws = await api.detectFileWorkspace(filePath);
    if (ws) this.showSuggest(ws, filePath);
    else this.hideSuggest();
  }

  private showSuggest(ws: Workspace, filePath: string) {
    const el = this.shell.workspaceSuggest;
    el.innerHTML = `
      <span class="ws-dot"></span>
      <div class="suggest-text">
        <span class="suggest-label">Part of mod</span>
        <span class="suggest-name">${escapeHtml(ws.name)}</span>
      </div>
      <button class="btn suggest-load">Load workspace</button>
      <button class="suggest-dismiss" title="Dismiss">✕</button>`;
    el.title = `${ws.namespace} · ${ws.root}`;
    el.classList.remove('hidden');
    el.querySelector<HTMLElement>('.suggest-load')!
      .addEventListener('click', () => void this.loadDetectedWorkspace(ws, filePath));
    el.querySelector<HTMLElement>('.suggest-dismiss')!
      .addEventListener('click', () => this.hideSuggest());
  }

  private hideSuggest() {
    const el = this.shell.workspaceSuggest;
    el.classList.add('hidden');
    el.innerHTML = '';
  }

  /** Activate the detected workspace and re-render the current file so its
   *  textures resolve from the mod. */
  private async loadDetectedWorkspace(ws: Workspace, filePath: string) {
    const active = await api.activateWorkspace(ws);
    this.hideSuggest();
    // onWorkspaceChanged has updated the badge/structures; reload to pull the
    // mod's textures/models into the current render.
    if (active) await this.load(filePath);
  }

  /** Render the recents list on the welcome screen (hidden when empty). */
  private renderRecents(recents: string[]) {
    const { recents: recentsEl, recentsList } = this.shell;
    if (recents.length === 0) {
      recentsEl.classList.add('hidden');
      recentsList.innerHTML = '';
      return;
    }
    recentsEl.classList.remove('hidden');
    recentsList.innerHTML = recents
      .map(
        (p) => `<li class="recent-row" title="${escapeHtml(p)}">
          <span class="recent-name">${escapeHtml(basename(p))}</span>
          <span class="recent-path">${escapeHtml(dirname(p))}</span>
        </li>`,
      )
      .join('');
    recentsList.querySelectorAll<HTMLElement>('.recent-row').forEach((row, i) => {
      row.addEventListener('click', () => this.load(recents[i]));
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
