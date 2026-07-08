// The world HUD's "find blocks" panel: search a block id across the LOADED area (the
// resident chunk payloads — "where are my diamond ore / spawners / chests"), nearest
// first. Results drop amber markers into the scene (visible through terrain) and list as
// jump-to buttons. Markers clear when the panel closes (unmount).
import { useEffect, useState } from 'react';
import { useViewer } from '../../viewer/ViewerProvider';
import { useT } from '../../hooks/useStores';

interface Props {
  /** Fly the camera to a result. */
  onJump: (pos: [number, number, number]) => void;
}

interface Results {
  hits: { pos: [number, number, number]; name: string }[];
  total: number;
}

export function WorldBlockFinder({ onJump }: Props) {
  const viewer = useViewer();
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);

  const search = () => {
    if (!viewer || !query.trim()) return;
    const r = viewer.findWorldBlocks(query);
    setResults(r);
    viewer.setWorldMarkers(r.hits.map((h) => h.pos));
  };

  // Markers live only while the panel is open.
  useEffect(() => () => viewer?.setWorldMarkers(null), [viewer]);

  return (
    <div className="world-hud-structs">
      <form
        className="world-blockfind-form"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          className="world-hud-search"
          type="search"
          placeholder={t('world.searchBlocks')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button type="submit" className="world-hud-btn primary">
          {t('world.findGo')}
        </button>
      </form>
      {results && (
        <div className="world-hud-struct-empty">
          {results.hits.length < results.total
            ? t('world.blockMatchesCapped', { n: results.hits.length, total: results.total.toLocaleString() })
            : t('world.blockMatches', { n: results.total })}
        </div>
      )}
      {results && results.hits.length > 0 && (
        <ul className="world-hud-struct-list">
          {results.hits.map((h, i) => (
            <li key={i}>
              <button onClick={() => onJump(h.pos)}>
                <span className="world-hud-struct-name">{h.name.replace('minecraft:', '')}</span>
                <span className="world-hud-struct-pos">
                  {h.pos[0]} {h.pos[1]} {h.pos[2]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
