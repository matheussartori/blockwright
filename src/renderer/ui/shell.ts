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
}

const TEMPLATE = `
  <header class="titlebar">
    <div class="title">
      <span class="logo"></span>
      <span class="name">Blockwright</span>
    </div>
    <div class="actions">
      <button id="open-btn" class="btn primary">Open NBT…</button>
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
        <button id="open-empty" class="btn primary lg">Open NBT file</button>
        <p class="hint" id="content-hint"></p>
      </div>
    </div>
    <div id="loading" class="loading hidden"><div class="spinner"></div></div>
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
  };
}
