// The bottom Console dock: a full-width log panel that surfaces both the
// renderer's and the main process's console output in-app, so packaged builds
// (with no terminal) can still be inspected. It wears the same chrome tokens as
// the right-hand inspector dock (.dock-head / .dock-btn / .segmented) for a
// cohesive look, adds a top drag-handle to resize, and tails new lines live.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LogLevel } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { windowsStore, MIN_CONSOLE_H } from '../state/windows';
import { useWindows, useLogs, useT } from '../hooks/useStores';
import type { LoggedEntry } from '../state/logs';
import { logsStore } from '../state/logs';
import { Segmented } from './ui/Segmented';

/** Severity ordering for the level filter (devtools-style: a level shows itself
 *  and everything more severe). */
const SEVERITY: Record<LogLevel, number> = { debug: 0, log: 1, info: 1, warn: 2, error: 3 };

type Filter = 'all' | 'warn' | 'error';
const FILTER_MIN: Record<Filter, number> = { all: 0, warn: 2, error: 3 };

const FILTERS: { value: Filter; label: MessageKey }[] = [
  { value: 'all', label: 'console.all' },
  { value: 'warn', label: 'console.warnings' },
  { value: 'error', label: 'console.errors' },
];

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatTime(ts: number): string {
  const ms = String(ts % 1000).padStart(3, '0');
  return `${TIME.format(ts)}.${ms}`;
}

/** Short labels for the generation tag badges (AI step vs code fix-up). */
const TAG_LABEL: Record<NonNullable<LoggedEntry['tag']>, string> = { ai: 'AI', fix: 'FIX' };

function LogRow({ entry }: { entry: LoggedEntry }) {
  const tagClass = entry.tag ? ` log-tag-${entry.tag}` : '';
  return (
    <div className={`log-row log-${entry.level}${tagClass}`}>
      <span className="log-time">{formatTime(entry.ts)}</span>
      <span className={`log-src log-src-${entry.source}`}>{entry.source}</span>
      <span className="log-text">
        {entry.tag && <span className={`log-badge log-badge-${entry.tag}`}>{TAG_LABEL[entry.tag]}</span>}
        {entry.text}
      </span>
    </div>
  );
}

export function ConsoleDock() {
  const t = useT();
  const visible = useWindows((s) => s.console.visible);
  const height = useWindows((s) => s.consoleHeight);
  const entries = useLogs((s) => s.entries);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const bodyRef = useRef<HTMLDivElement>(null);
  // Whether the view is pinned to the bottom — drives auto-scroll on new lines.
  const pinned = useRef(true);

  const shown = useMemo(() => {
    const min = FILTER_MIN[filter];
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) => SEVERITY[e.level] >= min && (q === '' || e.text.toLowerCase().includes(q)),
    );
  }, [entries, filter, query]);

  // Keep the newest line in view while the user hasn't scrolled up to read history.
  useLayoutEffect(() => {
    if (pinned.current && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [shown]);

  // Drag the top edge to resize; reads the live height at grab time and clamps to
  // the dock minimum and (most of) the window so it can't swallow the viewport.
  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const origin = windowsStore.getState().consoleHeight;
    const max = Math.max(MIN_CONSOLE_H, window.innerHeight - 160);
    const move = (ev: PointerEvent) => {
      const next = Math.min(max, Math.max(MIN_CONSOLE_H, origin + (startY - ev.clientY)));
      windowsStore.getState().setConsoleHeight(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('row-resizing');
    };
    document.body.classList.add('row-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Reset the pin whenever the dock is (re)opened so it lands at the latest line.
  useEffect(() => {
    if (visible) pinned.current = true;
  }, [visible]);

  if (!visible) return null;

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  return (
    <section className="console-dock" style={{ height }}>
      <div className="console-resize" onPointerDown={onResizeDown} aria-hidden="true" />
      <div className="dock-head console-head">
        <span className="console-title">{t('console.title')}</span>
        <span className="console-count">{shown.length}</span>
        <input
          className="console-search"
          type="search"
          placeholder={t('console.filter')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        <div className="console-head-actions">
          <Segmented<Filter>
            value={filter}
            options={FILTERS.map((f) => ({ value: f.value, label: t(f.label) }))}
            onChange={setFilter}
            ariaLabel={t('console.levelFilter')}
          />
          <button
            type="button"
            className="dock-btn"
            title={t('console.clear')}
            aria-label={t('console.clear')}
            onClick={() => logsStore.getState().clear()}
          >
            ⌫
          </button>
          <button
            type="button"
            className="dock-btn"
            title={t('console.closeHint')}
            aria-label={t('console.close')}
            onClick={() => windowsStore.getState().setVisible('console', false)}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="console-body" ref={bodyRef} onScroll={onScroll}>
        {shown.length === 0 ? (
          <div className="console-empty">
            {entries.length === 0 ? t('console.emptyNoLogs') : t('console.emptyNoMatch')}
          </div>
        ) : (
          shown.map((entry) => <LogRow key={entry.key} entry={entry} />)
        )}
      </div>
    </section>
  );
}
