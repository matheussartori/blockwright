// The tab strip beneath the titlebar: one tab per open document. Clicking a tab
// focuses it (the viewer + chat follow the active doc); the trailing "+" opens a
// blank Untitled generate tab. A tab spins while its build is generating, so you
// can watch a background tab work while you edit another. Hidden when no tabs
// are open (the welcome screen takes over).
import { useDocuments } from '../hooks/useStores';
import { documentsStore } from '../state/documents';

export function TabBar({ onNew, onClose }: { onNew: () => void; onClose: (id: string) => void }) {
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);
  if (documents.length === 0) return null;

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
