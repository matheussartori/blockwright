// The welcome / empty screen: open actions, the active workspace's structures
// (searchable), and the recent files / recent workspaces lists. Shown whenever
// no structure is open. Scrolls when content is tall so nothing is ever cut off.
import { useEffect, useMemo, useState } from 'react';
import type { Workspace } from '@/shared/types';
import { api } from '../api';
import { basename, dirname } from '../ui/path';
import { useApp } from '../hooks/useStores';

export function Welcome({
  onOpen,
  onLoad,
  onActivateWorkspace,
}: {
  onOpen: () => void;
  onLoad: (path: string) => void;
  onActivateWorkspace: (ws: Workspace) => void;
}) {
  const recents = useApp((s) => s.recents);
  const recentWorkspaces = useApp((s) => s.recentWorkspaces);
  const workspaceStructures = useApp((s) => s.workspaceStructures);
  const structure = useApp((s) => s.structure);

  const [query, setQuery] = useState('');
  const [hint, setHint] = useState('');

  // Probe the content pack once for the empty-state hint.
  useEffect(() => {
    void api.hasTexture('minecraft/block/stone').then((present) =>
      setHint(
        present
          ? 'Content pack detected — full textures available'
          : 'No content pack found — blocks render as flat colors',
      ),
    );
  }, []);

  const sortedStructures = useMemo(
    () => [...workspaceStructures].sort((a, b) => basename(a).localeCompare(basename(b))),
    [workspaceStructures],
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? sortedStructures.filter((p) => basename(p).toLowerCase().includes(q))
      : sortedStructures;
  }, [sortedStructures, query]);

  if (structure) return null;

  const total = sortedStructures.length;
  const hasLists = total > 0 || recents.length > 0 || recentWorkspaces.length > 0;

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-content">
          <div className="welcome-hero">
            <div className="welcome-icon" />
            <h1>View Minecraft structures in 3D</h1>
            <p>
              Open an <code>.nbt</code> file to render it from your content pack — or drop one
              anywhere on this window.
            </p>
            <div className="welcome-actions">
              <button className="btn primary lg" onClick={onOpen}>
                Open NBT file
              </button>
              <button className="btn lg" onClick={() => void api.openWorkspace()}>
                Open mod workspace…
              </button>
            </div>
            {hint && <span className="welcome-hint">{hint}</span>}
          </div>

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
