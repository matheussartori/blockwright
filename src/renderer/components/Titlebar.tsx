// The custom titlebar (drag region on macOS hiddenInset). The Open File button
// is the only interactive element, so it opts out of the drag region.
export function Titlebar({ onOpen }: { onOpen: () => void }) {
  return (
    <header className="titlebar">
      <div className="title">
        <span className="logo" />
        <span className="name">Blockwright</span>
      </div>
      <div className="actions">
        <button className="btn primary" onClick={onOpen}>
          Open File
        </button>
      </div>
    </header>
  );
}
