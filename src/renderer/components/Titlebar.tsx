// The custom titlebar (drag region on macOS hiddenInset). With tabs, files are
// closed from their tab, so the titlebar is just branding now — the tab strip
// (TabBar) sits directly beneath it.
export function Titlebar() {
  return (
    <header className="titlebar">
      <div className="title">
        <span className="logo" />
        <span className="name">Blockwright</span>
      </div>
    </header>
  );
}
