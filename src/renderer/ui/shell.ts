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
  workspaceStructuresSearch: HTMLInputElement;
  workspaceStructuresList: HTMLElement;
  /** Top-left navigation cheatsheet shown while a structure is open. */
  controlsHelp: HTMLElement;
  /** Mode chip inside the cheatsheet (Orbit / Fly). */
  controlsMode: HTMLElement;
  /** Bottom-left badge shown while a workspace is active. */
  workspaceBadge: HTMLElement;
  /** Bottom-left prompt offering to load a detected mod workspace (hidden by default). */
  workspaceSuggest: HTMLElement;
  /** Bottom-right jigsaw panel, shown while a structure with jigsaws is open. */
  jigsawPanel: HTMLElement;
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
          <input id="workspace-structures-search" class="recents-search" type="search"
                 placeholder="Search structures…" autocomplete="off" spellcheck="false" />
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
    <div id="controls-help" class="controls-help hidden">
      <button id="controls-help-toggle" class="ch-head" type="button">
        <span class="ch-title">Controls</span>
        <span id="controls-mode" class="ch-mode">Orbit</span>
        <span class="ch-chevron">⌄</span>
      </button>
      <div class="ch-body">
        <div class="ch-group ch-group--orbit">
          <div class="ch-group-name">Orbit</div>
          <ul>
            <li><kbd>Drag</kbd><span>rotate</span></li>
            <li><kbd>R-drag</kbd><span>pan</span></li>
            <li><kbd>Scroll</kbd><span>zoom</span></li>
            <li><kbd>F</kbd><span>enter fly</span></li>
          </ul>
        </div>
        <div class="ch-group ch-group--fly">
          <div class="ch-group-name">Fly · noclip</div>
          <ul>
            <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>move</span></li>
            <li><kbd>Space</kbd><kbd>Shift</kbd><span>up / down</span></li>
            <li><kbd>Mouse</kbd><span>look</span></li>
            <li><kbd>Scroll</kbd><span>speed</span></li>
            <li><kbd>Esc</kbd><kbd>F</kbd><span>exit</span></li>
          </ul>
        </div>
      </div>
    </div>
    <div id="loading" class="loading hidden"><div class="spinner"></div></div>
    <div id="workspace-badge" class="workspace-badge hidden"></div>
    <div id="workspace-suggest" class="workspace-suggest hidden"></div>
    <div id="jigsaw-panel" class="jigsaw-panel hidden"></div>
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
    workspaceStructuresSearch: byId('workspace-structures-search') as HTMLInputElement,
    workspaceStructuresList: byId('workspace-structures-list'),
    controlsHelp: byId('controls-help'),
    controlsMode: byId('controls-mode'),
    workspaceBadge: byId('workspace-badge'),
    workspaceSuggest: byId('workspace-suggest'),
    jigsawPanel: byId('jigsaw-panel'),
  };
}
