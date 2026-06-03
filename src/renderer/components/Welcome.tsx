// The welcome / empty screen: a hero, the primary entry actions as cards, and
// the active workspace's structures plus recent files / workspaces. Shown
// whenever no structure is open. Scrolls when content is tall so nothing is cut.
import { useEffect, useMemo, useState } from 'react';
import type { Workspace } from '@/shared/types';
import { api } from '../api';
import { basename, dirname } from '../ui/path';
import { useApp } from '../hooks/useStores';
import { store } from '../state/store';
import { Logo } from './ui/Logo';

/** Minimal stroke icons for the action cards (no icon-font dependency). */
const ICONS = {
  spark: (
    <path
      d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5 10.2 7.7 12 3z"
      fill="currentColor"
      stroke="none"
    />
  ),
  file: <path d="M13 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V9l-6-6z M13 3v6h6" />,
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5v-11z" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
} as const;

function ActionIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export function Welcome({
  onOpen,
  onLoad,
  onActivateWorkspace,
  onGenerate,
}: {
  onOpen: () => void;
  onLoad: (path: string) => void;
  onActivateWorkspace: (ws: Workspace) => void;
  onGenerate: () => void;
}) {
  const recents = useApp((s) => s.recents);
  const recentWorkspaces = useApp((s) => s.recentWorkspaces);
  const workspaceStructures = useApp((s) => s.workspaceStructures);

  const [query, setQuery] = useState('');
  const [hasPack, setHasPack] = useState<boolean | null>(null);

  // Probe the content pack once for the empty-state hint.
  useEffect(() => {
    void api.hasTexture('minecraft/block/stone').then(setHasPack);
  }, []);

  const sortedStructures = useMemo(
    () => [...workspaceStructures].sort((a, b) => basename(a).localeCompare(basename(b))),
    [workspaceStructures],
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sortedStructures.filter((p) => basename(p).toLowerCase().includes(q)) : sortedStructures;
  }, [sortedStructures, query]);

  const total = sortedStructures.length;
  const hasLists = total > 0 || recents.length > 0 || recentWorkspaces.length > 0;

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-content">
          <header className="welcome-hero">
            <Logo size={72} className="welcome-mark" />
            <h1>Blockwright</h1>
            <p className="welcome-tagline">Build, view, and AI-generate Minecraft structures in 3D.</p>
          </header>

          <div className="welcome-actions">
            <button className="action-card accent" onClick={onGenerate}>
              <span className="action-ic"><ActionIcon name="spark" /></span>
              <span className="action-body">
                <span className="action-title">Generate with AI</span>
                <span className="action-sub">Describe a build, get a structure</span>
              </span>
            </button>
            <button className="action-card" onClick={onOpen}>
              <span className="action-ic"><ActionIcon name="file" /></span>
              <span className="action-body">
                <span className="action-title">Open NBT file</span>
                <span className="action-sub">View an existing structure</span>
              </span>
            </button>
            <button className="action-card" onClick={() => void api.openWorkspace()}>
              <span className="action-ic"><ActionIcon name="folder" /></span>
              <span className="action-body">
                <span className="action-title">Open mod workspace</span>
                <span className="action-sub">Load a mod's blocks &amp; structures</span>
              </span>
            </button>
            <button className="action-card" onClick={() => store.getState().setCatalogOpen(true)}>
              <span className="action-ic"><ActionIcon name="grid" /></span>
              <span className="action-body">
                <span className="action-title">Block catalog</span>
                <span className="action-sub">Browse every available block</span>
              </span>
            </button>
          </div>

          {hasPack !== null && (
            <span className={`welcome-hint${hasPack ? '' : ' warn'}`}>
              <span className="welcome-hint-dot" />
              {hasPack ? 'Content pack detected — full textures available' : 'No content pack — blocks render as flat colors'}
            </span>
          )}

          {hasLists && (
            <div className="welcome-lists">
              {total > 0 && (
                <section className="list-card">
                  <div className="list-head">
                    <span className="list-title">Workspace structures</span>
                    <span className="list-count">{query.trim() ? `${matches.length}/${total}` : total}</span>
                  </div>
                  <div className="list-search-wrap">
                    <input
                      className="list-search"
                      type="search"
                      placeholder="Search structures…"
                      autoComplete="off"
                      spellCheck={false}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <ul className="list-body">
                    {matches.length === 0 ? (
                      <li className="list-empty">No structures match “{query}”.</li>
                    ) : (
                      matches.map((p) => (
                        <li key={p} className="recent-row" title={p} onClick={() => onLoad(p)}>
                          <span className="recent-name">{basename(p)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              )}

              {(recents.length > 0 || recentWorkspaces.length > 0) && (
                <div className="welcome-cols">
                  {recents.length > 0 && (
                    <section className="list-card">
                      <div className="list-head">
                        <span className="list-title">Recent files</span>
                        <button className="link" onClick={() => void api.clearRecents()}>
                          Clear
                        </button>
                      </div>
                      <ul className="list-body">
                        {recents.map((p) => (
                          <li key={p} className="recent-row" title={p} onClick={() => onLoad(p)}>
                            <span className="recent-name">{basename(p)}</span>
                            <span className="recent-path">{dirname(p)}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {recentWorkspaces.length > 0 && (
                    <section className="list-card">
                      <div className="list-head">
                        <span className="list-title">Recent workspaces</span>
                        <button className="link" onClick={() => void api.clearRecentWorkspaces()}>
                          Clear
                        </button>
                      </div>
                      <ul className="list-body">
                        {recentWorkspaces.map((ws) => (
                          <li
                            key={`${ws.namespace}:${ws.root}`}
                            className="recent-row"
                            title={`${ws.namespace} · ${ws.root}`}
                            onClick={() => onActivateWorkspace(ws)}
                          >
                            <span className="recent-name">{ws.name}</span>
                            <span className="recent-path">{ws.namespace}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
