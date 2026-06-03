// The slim top bar: the app's only chrome row (no separate titlebar). It's the
// macOS drag region (with traffic-light clearance) and holds one tab per open
// document; the trailing "+" opens a blank Untitled generate tab. A tab spins
// while its build is generating, so you can watch a background tab work while you
// edit another. Always rendered (even with no docs) so the drag region and
// traffic-light space persist on the welcome screen.
import { useDocuments } from '../hooks/useStores';
import { documentsStore } from '../state/documents';

export function TabBar({ onNew, onClose }: { onNew: () => void; onClose: (id: string) => void }) {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);

  return (
    <div className="tabbar" role="tablist">
      {documents.map((d) => (
        <div
          key={d.id}
          role="tab"
          aria-selected={d.id === activeId}
          className={`tab${d.id === activeId ? ' active' : ''}`}
          title={d.filePath ?? d.title}
          onClick={() => documentsStore.getState().setActive(d.id)}
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault(); // middle-click closes
              onClose(d.id);
            }
          }}
        >
          {d.busy && <span className="tab-spinner" aria-hidden />}
          <span className="tab-title">{d.title}</span>
          <button
            className="tab-close"
            aria-label="Close tab"
            title="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              onClose(d.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button className="tab-new" title="New tab" aria-label="New tab" onClick={onNew}>
        +
      </button>
    </div>
  );
}
