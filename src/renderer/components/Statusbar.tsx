// The bottom status bar. Left: the active mod workspace segment (moved here
// from the old floating badge — clicking it switches workspace; the pin beside
// it keeps the workspace across restarts), then the open structure's summary.
// A transient notice (e.g. a load error) replaces the summary; the right edge
// reports the content-pack state.
import { Package, Pin } from 'lucide-react';
import { api } from '../api';
import { store } from '../state/store';
import { useApp, useActiveDoc, useT } from '../hooks/useStores';
import { Tooltip } from './ui/Tooltip';

function WorkspaceSegment() {
  const t = useT();
  const workspace = useApp((s) => s.workspace);
  const pinnedRoot = useApp((s) => s.pinnedWorkspaceRoot);
  if (!workspace) return null;
  const pinned = pinnedRoot === workspace.root;
  const pinLabel = pinned ? t('workspace.unpin') : t('workspace.pin');
  return (
    <div className="status-ws-group">
      <button
        type="button"
        className="status-seg workspace"
        title={`${t('workspace.label')} · ${workspace.namespace} · ${workspace.root}`}
        onClick={() => void api.openWorkspace()}
      >
        <Package size={12} strokeWidth={1.8} aria-hidden />
        <span className="status-ws-name">{workspace.name}</span>
      </button>
      <Tooltip
        label={pinLabel}
        description={pinned ? t('workspace.unpinDesc') : t('workspace.pinDesc')}
        placement="top"
      >
        <button
          type="button"
          className={`status-pin${pinned ? ' on' : ''}`}
          aria-label={pinLabel}
          aria-pressed={pinned}
          onClick={() =>
            void api.pinWorkspace(!pinned).then((root) => store.getState().setPinnedWorkspaceRoot(root))
          }
        >
          <Pin size={11} strokeWidth={1.8} aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}

export function Statusbar() {
  const t = useT();
  const structure = useActiveDoc()?.structure ?? null;
  const notice = useApp((s) => s.notice);

  if (notice) {
    return (
      <footer className="statusbar">
        <WorkspaceSegment />
        <span className={notice.warn ? 'warn' : 'muted'}>{notice.text}</span>
      </footer>
    );
  }

  if (!structure) {
    return (
      <footer className="statusbar">
        <WorkspaceSegment />
        <span className="muted">{t('statusbar.noFile')}</span>
      </footer>
    );
  }

  // Palette size, matching the Info panel (the file's full palette, air-like entries included).
  const typeCount = structure.palette.length;
  const jigsawCount = structure.jigsaws.length;

  return (
    <footer className="statusbar">
      <WorkspaceSegment />
      <span className="status-name">{structure.name}</span>
      <span className="sep">·</span>
      <span className="muted stat-num" title={t('statusbar.sizeTitle')}>{structure.size.join('×')}</span>
      <span className="sep">·</span>
      <span className="muted" title={t('statusbar.blocksTitle')}>
        <span className="stat-num">{structure.blockCount.toLocaleString()}</span> {t('statusbar.blocksLabel')}
      </span>
      <span className="sep">·</span>
      <span className="muted" title={t('statusbar.typesTitle')}>
        <span className="stat-num">{typeCount.toLocaleString()}</span> {t('statusbar.typesLabel')}
      </span>
      {jigsawCount > 0 && (
        <>
          <span className="sep">·</span>
          <span className="muted" title={t('statusbar.jigsawTitle')}>
            <span className="stat-num">{jigsawCount}</span> {t('statusbar.jigsawLabel')}
          </span>
        </>
      )}
      <span className="spacer" />
      <span className="mode">
        <span className={`dot ${structure.hasContent ? 'ok' : 'warn-dot'}`} />
        {structure.hasContent ? t('statusbar.contentPack') : t('statusbar.fallbackColors')}
      </span>
    </footer>
  );
}
