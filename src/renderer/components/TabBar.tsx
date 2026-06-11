// The slim top bar: the app's only chrome row (no separate titlebar). It's the
// macOS drag region (with traffic-light clearance) and holds one tab per open
// document; the trailing "+" opens a blank Untitled generate tab. A tab spins
// while its build is generating, so you can watch a background tab work while you
// edit another. Always rendered (even with no docs) so the drag region and
// traffic-light space persist on the welcome screen.
import { House } from 'lucide-react';
import { useDocuments, useT } from '../hooks/useStores';
import { documentsStore } from '../state/documents';

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
      <button
        type="button"
        className={`tab-home${activeId === null ? ' active' : ''}`}
        title={t('tab.home')}
        aria-label={t('tab.home')}
        onClick={() => documentsStore.getState().goHome()}
      >
        <House size={17} strokeWidth={1.8} aria-hidden />
      </button>
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
      ))}
      <button className="tab-new" title={t('tab.newTab')} aria-label={t('tab.newTab')} onClick={onNew}>
        +
      </button>
    </div>
  );
}
