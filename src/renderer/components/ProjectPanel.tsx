// The left Project panel — the workbench explorer. Everything that used to be
// reachable only from the welcome screen lives here permanently: the active mod
// workspace and its structures (searchable), plus recent files, workspaces and
// worlds. Toggled from the activity rail; width is resizable + persisted.
import { useMemo, useState } from 'react';
import { FileBox, FolderOpen, Globe, Package, Pin } from 'lucide-react';
import type { Workspace } from '@/shared/types';
import { api } from '../api';
import { basename, dirname } from '../ui/path';
import { startColDrag } from '../ui/resize';
import { useApp, useT, useWindows } from '../hooks/useStores';
import { windowsStore } from '../state/windows';
import { Tooltip } from './ui/Tooltip';

export interface ProjectPanelHandlers {
  /** Open a structure file in a tab. */
  onLoad: (path: string) => void;
  /** Activate a recent mod workspace. */
  onActivateWorkspace: (ws: Workspace) => void;
  /** Open a Minecraft world (no arg = folder picker; a root = a recent world). */
  onOpenWorld: (root?: string) => void;
  /** Open the structure-file picker dialog. */
  onOpen: () => void;
}

function Row({
  icon,
  name,
  sub,
  title,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  name: string;
  sub?: string;
  title: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <li className="proj-row" title={title} onClick={onClick}>
      <span className="proj-row-ic">{icon}</span>
      <span className="proj-row-name">{name}</span>
      {sub && <span className="proj-row-sub">{sub}</span>}
      {trailing}
    </li>
  );
}

/** Passive "this one is pinned" glyph (the CONTROL lives in the statusbar/menu). */
function PinMark({ label }: { label: string }) {
  return (
    <span className="proj-pin" role="img" aria-label={label} title={label}>
      <Pin size={11} strokeWidth={1.8} aria-hidden />
    </span>
  );
}

export function ProjectPanel({ onLoad, onActivateWorkspace, onOpenWorld, onOpen }: ProjectPanelHandlers) {
  const t = useT();
  const visible = useWindows((s) => s.projectVisible);
  const width = useWindows((s) => s.leftWidth);
  const workspace = useApp((s) => s.workspace);
  const pinnedRoot = useApp((s) => s.pinnedWorkspaceRoot);
  const workspaceStructures = useApp((s) => s.workspaceStructures);
  const recents = useApp((s) => s.recents);
  const recentWorkspaces = useApp((s) => s.recentWorkspaces);
  const recentWorlds = useApp((s) => s.recentWorlds);
  const [query, setQuery] = useState('');

  const structures = useMemo(
    () => [...workspaceStructures].sort((a, b) => basename(a).localeCompare(basename(b))),
    [workspaceStructures],
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? structures.filter((p) => basename(p).toLowerCase().includes(q)) : structures;
  }, [structures, query]);

  if (!visible) return null;

  const empty =
    !workspace &&
    structures.length === 0 &&
    recents.length === 0 &&
    recentWorkspaces.length === 0 &&
    recentWorlds.length === 0;

  return (
    <aside className="project-panel" style={{ width }} aria-label={t('project.title')}>
      <div className="proj-head">
        <span className="proj-title">{t('project.title')}</span>
        <div className="proj-actions">
          <Tooltip label={t('welcome.openTitle')} placement="bottom">
            <button type="button" className="dock-btn" aria-label={t('welcome.openTitle')} onClick={onOpen}>
              <FileBox size={15} strokeWidth={1.7} />
            </button>
          </Tooltip>
          <Tooltip label={t('welcome.worldTitle')} placement="bottom">
            <button
              type="button"
              className="dock-btn"
              aria-label={t('welcome.worldTitle')}
              onClick={() => onOpenWorld()}
            >
              <Globe size={15} strokeWidth={1.7} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="proj-body">
        {/* Active workspace card — or the affordance to open one. */}
        {workspace ? (
          <div className="proj-workspace" title={`${workspace.namespace} · ${workspace.root}`}>
            <span className="ws-dot" />
            <span className="proj-ws-name">{workspace.name}</span>
            {pinnedRoot === workspace.root && <PinMark label={t('workspace.pinned')} />}
            <span className="proj-ws-ns">{workspace.namespace}</span>
          </div>
        ) : (
          <button type="button" className="proj-workspace open" onClick={() => void api.openWorkspace()}>
            <Package size={15} strokeWidth={1.7} aria-hidden />
            <span>{t('welcome.workspaceTitle')}</span>
          </button>
        )}

        {empty && <p className="proj-empty">{t('project.empty')}</p>}

        {structures.length > 0 && (
          <section className="proj-section">
            <div className="proj-section-head">
              <span>{t('welcome.workspaceStructures')}</span>
              <span className="proj-count">{query.trim() ? `${matches.length}/${structures.length}` : structures.length}</span>
            </div>
            {structures.length > 6 && (
              <input
                className="proj-search"
                type="search"
                placeholder={t('welcome.searchPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            <ul className="proj-list">
              {matches.length === 0 ? (
                <li className="proj-none">{t('welcome.noMatch', { query })}</li>
              ) : (
                matches.map((p) => (
                  <Row
                    key={p}
                    icon={<FileBox size={14} strokeWidth={1.7} aria-hidden />}
                    name={basename(p)}
                    title={p}
                    onClick={() => onLoad(p)}
                  />
                ))
              )}
            </ul>
          </section>
        )}

        {recents.length > 0 && (
          <section className="proj-section">
            <div className="proj-section-head">
              <span>{t('welcome.recentFiles')}</span>
              <button className="link" onClick={() => void api.clearRecents()}>
                {t('common.clear')}
              </button>
            </div>
            <ul className="proj-list">
              {recents.map((p) => (
                <Row
                  key={p}
                  icon={<FileBox size={14} strokeWidth={1.7} aria-hidden />}
                  name={basename(p)}
                  sub={dirname(p)}
                  title={p}
                  onClick={() => onLoad(p)}
                />
              ))}
            </ul>
          </section>
        )}

        {recentWorkspaces.length > 0 && (
          <section className="proj-section">
            <div className="proj-section-head">
              <span>{t('welcome.recentWorkspaces')}</span>
              <button className="link" onClick={() => void api.clearRecentWorkspaces()}>
                {t('common.clear')}
              </button>
            </div>
            <ul className="proj-list">
              {recentWorkspaces.map((ws) => (
                <Row
                  key={`${ws.namespace}:${ws.root}`}
                  icon={<FolderOpen size={14} strokeWidth={1.7} aria-hidden />}
                  name={ws.name}
                  sub={ws.namespace}
                  title={`${ws.namespace} · ${ws.root}`}
                  trailing={ws.root === pinnedRoot ? <PinMark label={t('workspace.pinned')} /> : undefined}
                  onClick={() => onActivateWorkspace(ws)}
                />
              ))}
            </ul>
          </section>
        )}

        {recentWorlds.length > 0 && (
          <section className="proj-section">
            <div className="proj-section-head">
              <span>{t('welcome.recentWorlds')}</span>
              <button className="link" onClick={() => void api.clearRecentWorlds()}>
                {t('common.clear')}
              </button>
            </div>
            <ul className="proj-list">
              {recentWorlds.map((w) => (
                <Row
                  key={w.root}
                  icon={<Globe size={14} strokeWidth={1.7} aria-hidden />}
                  name={w.name}
                  sub={dirname(w.root)}
                  title={w.root}
                  onClick={() => onOpenWorld(w.root)}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      <div
        className="col-resize end"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          startColDrag(e, windowsStore.getState().leftWidth, 1, (w) =>
            windowsStore.getState().setLeftWidth(w),
          );
        }}
      />
    </aside>
  );
}
