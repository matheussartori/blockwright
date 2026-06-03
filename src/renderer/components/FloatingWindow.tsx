// The one chrome every floating window (Controls / Inspector / Jigsaw) wears, so
// titles, spacing and typography read identically across the app. Title-bar
// drag (clamped to the stage) and a minimize-only collapse, both backed by the
// persisted `windows` store. Showing/hiding a window is done from the View menu.
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { windowsStore, WINDOW_WIDTHS, type PanelId } from '../state/windows';
import { useWindows } from '../hooks/useStores';

interface FloatingWindowProps {
  id: PanelId;
  title: string;
  /** Optional chip/label shown next to the title (e.g. a connector count). */
  headerExtra?: ReactNode;
  /** When false the window is hidden regardless of its stored visibility. */
  available?: boolean;
  /** Extra class on the window root (e.g. for a fixed-height panel). */
  className?: string;
  /** Drop the body's default padding/scroll so the child manages its own layout. */
  flush?: boolean;
  children: ReactNode;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function FloatingWindow({
  id,
  title,
  headerExtra,
  available = true,
  className,
  flush,
  children,
}: FloatingWindowProps) {
  const state = useWindows((s) => s[id]);
  const ref = useRef<HTMLDivElement>(null);

  if (!available || !state.visible) return null;

  // Drag from the title bar. Reads the live position at grab time (not the
  // render-closure value) and clamps so the window stays within the stage.
  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = ref.current;
    const stage = el?.offsetParent as HTMLElement | null;
    if (!el || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    const winW = el.offsetWidth;
    const winH = el.offsetHeight;
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = windowsStore.getState()[id];

    const move = (ev: PointerEvent) => {
      const nx = clamp(origin.x + (ev.clientX - startX), 0, Math.max(0, stageRect.width - winW));
      const ny = clamp(origin.y + (ev.clientY - startY), 0, Math.max(0, stageRect.height - winH));
      windowsStore.getState().setPos(id, nx, ny);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <section
      ref={ref}
      className={`bw-window${state.minimized ? ' minimized' : ''}${className ? ` ${className}` : ''}`}
      style={{ left: state.x, top: state.y, width: WINDOW_WIDTHS[id] }}
    >
      <div className="bw-window-head" onPointerDown={onHeaderPointerDown}>
        <span className="bw-window-title">{title}</span>
        {headerExtra && <span className="bw-window-extra">{headerExtra}</span>}
        <button
          type="button"
          className="bw-window-btn redock"
          title="Dock to sidebar"
          aria-label="Dock to sidebar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => windowsStore.getState().setFloating(id, false)}
        >
          ⤢
        </button>
        <button
          type="button"
          className="bw-window-btn bw-window-min"
          title={state.minimized ? 'Expand' : 'Minimize'}
          aria-label={state.minimized ? 'Expand' : 'Minimize'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => windowsStore.getState().toggleMinimized(id)}
        >
          ⌄
        </button>
      </div>
      {!state.minimized && (
        <div className={`bw-window-body${flush ? ' flush' : ''}`}>{children}</div>
      )}
    </section>
  );
}
