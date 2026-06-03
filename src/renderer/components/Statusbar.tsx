// The bottom status bar: a transient notice (e.g. a load error) overrides the
// structure summary; otherwise it shows the open structure or the idle line.
import { useApp, useActiveDoc } from '../hooks/useStores';

export function Statusbar() {
  const structure = useActiveDoc()?.structure ?? null;
  const notice = useApp((s) => s.notice);

  if (notice) {
    return (
      <footer className="statusbar">
        <span className={notice.warn ? 'warn' : 'muted'}>{notice.text}</span>
      </footer>
    );
  }

  if (!structure) {
    return (
      <footer className="statusbar">
        <span className="muted">No file loaded</span>
      </footer>
    );
  }

  return (
    <footer className="statusbar">
      <span>{structure.name}</span>
      <span className="sep">·</span>
      <span className="muted">{structure.size.join('×')}</span>
      <span className="sep">·</span>
      <span className="muted">{structure.blockCount.toLocaleString()} blocks</span>
      <span className="spacer" />
      <span className="mode">
        <span className={`dot ${structure.hasContent ? 'ok' : 'warn-dot'}`} />
        {structure.hasContent ? 'Content pack' : 'Fallback colors'}
      </span>
    </footer>
  );
}
