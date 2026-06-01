// Builds the static app chrome (titlebar / stage / statusbar) and hands back
// typed references to the elements the rest of the renderer drives.

export interface Shell {
  viewport: HTMLElement;
  inspector: HTMLElement;
  emptyState: HTMLElement;
  loading: HTMLElement;
  statusbar: HTMLElement;
  openButtons: HTMLElement[];
  contentHint: HTMLElement | null;
  /** Recents block on the welcome screen (hidden when empty). */
  recents: HTMLElement;
  recentsList: HTMLElement;
  recentsClear: HTMLElement;
  /** Recent-workspaces block on the welcome screen (hidden when empty). */
  recentWorkspaces: HTMLElement;
  recentWorkspacesList: HTMLElement;
  recentWorkspacesClear: HTMLElement;
  /** Welcome-screen button that opens a mod workspace. */
  openWorkspaceButton: HTMLElement;
  /** Welcome-screen list of the active workspace's structures (hidden when none). */
  workspaceStructures: HTMLElement;
  workspaceStructuresHead: HTMLElement;
  workspaceStructuresList: HTMLElement;
  /** Bottom-left badge shown while a workspace is active. */
  workspaceBadge: HTMLElement;
  /** Bottom-left prompt offering to load a detected mod workspace (hidden by default). */
  workspaceSuggest: HTMLElement;
}

const TEMPLATE = `
  <header class="titlebar">
    <div class="title">
      <span class="logo"></span>
      <span class="name">Blockwright</span>
    </div>
    <div class="actions">
      <button id="open-btn" class="btn primary">Open File</button>
    </div>
  </header>
  <main class="stage">
    <div id="viewport" class="viewport"></div>
    <aside id="inspector" class="inspector hidden"></aside>
    <div id="empty" class="empty">
      <div class="empty-card">
        <div class="empty-icon"></div>
        <h1>View Minecraft structures in 3D</h1>
        <p>Open an <code>.nbt</code> file to render it from your content pack —
           or drop one anywhere on this window.</p>
        <div class="empty-actions">
          <button id="open-empty" class="btn primary lg">Open NBT file</button>
          <button id="open-workspace" class="btn lg">Open mod workspace…</button>
        </div>
        <p class="hint" id="content-hint"></p>
        <div id="workspace-structures" class="recents hidden">
          <div class="recents-head">
            <span id="workspace-structures-head">Workspace structures</span>
          </div>
          <ul id="workspace-structures-list" class="recents-list"></ul>
        </div>
        <div class="recents-cols">
          <div id="recents" class="recents hidden">
            <div class="recents-head">
              <span>Recent files</span>
              <button id="recents-clear" class="link">Clear</button>
            </div>
            <ul id="recents-list" class="recents-list"></ul>
          </div>
          <div id="recent-workspaces" class="recents hidden">
            <div class="recents-head">
              <span>Recent workspaces</span>
              <button id="recent-workspaces-clear" class="link">Clear</button>
            </div>
            <ul id="recent-workspaces-list" class="recents-list"></ul>
          </div>
        </div>
      </div>
    </div>
    <div id="loading" class="loading hidden"><div class="spinner"></div></div>
    <div id="workspace-badge" class="workspace-badge hidden"></div>
    <div id="workspace-suggest" class="workspace-suggest hidden"></div>
  </main>
  <footer class="statusbar" id="statusbar">
    <span class="muted">No file loaded</span>
  </footer>
`;

/** Render the shell into `root` and return references to its key elements. */
export function mountShell(root: HTMLElement, platform: string): Shell {
  root.classList.add('shell', `platform-${platform}`);
  root.innerHTML = TEMPLATE;

  const byId = (id: string) => document.getElementById(id)!;
  return {
    viewport: byId('viewport'),
    inspector: byId('inspector'),
    emptyState: byId('empty'),
    loading: byId('loading'),
    statusbar: byId('statusbar'),
    openButtons: [byId('open-btn'), byId('open-empty')],
    contentHint: document.getElementById('content-hint'),
    recents: byId('recents'),
    recentsList: byId('recents-list'),
    recentsClear: byId('recents-clear'),
    recentWorkspaces: byId('recent-workspaces'),
    recentWorkspacesList: byId('recent-workspaces-list'),
    recentWorkspacesClear: byId('recent-workspaces-clear'),
    openWorkspaceButton: byId('open-workspace'),
    workspaceStructures: byId('workspace-structures'),
    workspaceStructuresHead: byId('workspace-structures-head'),
    workspaceStructuresList: byId('workspace-structures-list'),
    workspaceBadge: byId('workspace-badge'),
    workspaceSuggest: byId('workspace-suggest'),
  };
}
