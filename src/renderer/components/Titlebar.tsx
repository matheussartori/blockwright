// The custom titlebar (drag region on macOS hiddenInset). It carries a minimal
// "Close file" icon once a structure is loaded; on the welcome screen there's no
// action here (opening is done from the welcome view itself).
export function Titlebar({ fileOpen, onClose }: { fileOpen: boolean; onClose: () => void }) {
  return (
    <header className="titlebar">
      <div className="title">
        <span className="logo" />
        <span className="name">Blockwright</span>
      </div>
      <div className="actions">
        {fileOpen && (
          <button className="btn icon" onClick={onClose} title="Close file" aria-label="Close file">
            ✕
          </button>
        )}
      </div>
    </header>
  );
}
