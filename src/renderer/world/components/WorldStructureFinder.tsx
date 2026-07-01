// The world HUD's "find structures" panel: scans the active dimension for generated structures (once
// per dimension, cached in main) and lists them as jump-to buttons with a live text filter. Mounted
// only while the panel is open, so the scan kicks off on open and re-runs when the dimension changes.
import { useEffect, useState } from 'react';
import type { DimensionId, StructureLocation } from '@/shared/types';
import { api } from '../../api';
import { useT } from '../../hooks/useStores';

interface Props {
  /** Dimension to scan (re-scans when it changes). */
  dim: DimensionId;
  /** Fly the camera to a structure's location. */
  onJump: (pos: [number, number, number]) => void;
}

export function WorldStructureFinder({ dim, onJump }: Props) {
  const t = useT();
  const [structs, setStructs] = useState<StructureLocation[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setStructs(null);
    let live = true;
    void api.findWorldStructures(dim).then((s) => live && setStructs(s));
    return () => {
      live = false;
    };
  }, [dim]);

  const q = query.trim().toLowerCase();
  const list = structs && (q ? structs.filter((s) => s.label.toLowerCase().includes(q)) : structs);

  return (
    <div className="world-hud-structs">
      <input
        className="world-hud-search"
        type="search"
        placeholder={t('world.searchStructures')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {list === null ? (
        <div className="world-hud-struct-empty">{t('world.scanning')}</div>
      ) : list.length === 0 ? (
        <div className="world-hud-struct-empty">{t('world.noStructures')}</div>
      ) : (
        <ul className="world-hud-struct-list">
          {list.map((s, i) => (
            <li key={`${s.id}-${i}`}>
              <button onClick={() => onJump([s.x, s.y, s.z])}>
                <span className="world-hud-struct-name">{s.label}</span>
                <span className="world-hud-struct-pos">
                  {s.x} {s.y} {s.z}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
