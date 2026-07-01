// The slim top bar: the app's only chrome row (no separate titlebar). It's the
// macOS drag region (with traffic-light clearance) and holds one tab per open
// document; the trailing "+" opens a blank Untitled generate tab. Each tab
// carries its document-kind icon (structure / world / new build) and spins while
// its build is generating, so you can watch a background tab work while you edit
// another. Home lives on the activity rail now; the bar is always rendered (even
// with no docs) so the drag region and traffic-light space persist.
import { Box, Globe, Plus, Sparkles } from 'lucide-react';
import { useDocuments, useT } from '../hooks/useStores';
import { documentsStore, type Document } from '../state/documents';

function docIcon(d: Document) {
  if (d.kind === 'world') return Globe;
  // A tab with a file (opened or generated) is a structure; a blank build tab
  // still composing is the Generate surface.
  if (d.filePath || d.structure) return Box;
  return Sparkles;
}

export function TabBar({ onNew, onClose }: { onNew: () => void; onClose: (id: string) => void }) {
  const t = useT();
  const documents = useDocuments((s) => s.documents);
  const activeId = useDocuments((s) => s.activeId);

  // Translate vertical wheel into horizontal scroll so the overflowing tabs are
  // reachable with an ordinary mouse (not every mouse has a horizontal wheel).
  // A real horizontal gesture (trackpad / tilt wheel) still scrolls natively.
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
  };

  return (
    <div className="tabbar" role="tablist" onWheel={onWheel}>
      {documents.map((d) => {
        const Icon = docIcon(d);
        return (
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
            {d.busy ? (
              <span className="tab-spinner" aria-hidden />
            ) : (
              <Icon className="tab-ic" size={13} strokeWidth={1.8} aria-hidden />
            )}
            <span className="tab-title">{d.title}</span>
            <button
              className="tab-close"
              aria-label={t('tab.closeTab')}
              title={t('tab.closeTab')}
              onClick={(e) => {
                e.stopPropagation();
                onClose(d.id);
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button className="tab-new" title={t('tab.newTab')} aria-label={t('tab.newTab')} onClick={onNew}>
        <Plus size={15} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
