// The world HUD's waypoints panel: named camera bookmarks persisted per world (userData,
// keyed by world root). Add captures the CURRENT camera position + dimension; a row jump
// switches dimension when needed and flies there. The parent supplies world root + current
// dim + the imperative hooks; this component owns the list round-trip.
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { DimensionId, WorldWaypoint } from '@/shared/types';
import { api } from '../../api';
import { useT } from '../../hooks/useStores';

interface Props {
  /** The open world's root path (the persistence key). */
  root: string;
  /** The dimension currently shown (a waypoint in another one switches first). */
  dim: DimensionId;
  /** The current camera position (what Add bookmarks). */
  cameraPos: () => [number, number, number];
  /** Fly to a waypoint (the parent switches dimension when it differs). */
  onJump: (wp: WorldWaypoint) => void;
}

export function WorldWaypoints({ root, dim, cameraPos, onJump }: Props) {
  const t = useT();
  const [waypoints, setWaypoints] = useState<WorldWaypoint[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    let stale = false;
    void api.getWorldWaypoints(root).then((list) => {
      if (!stale) setWaypoints(list);
    });
    return () => {
      stale = true;
    };
  }, [root]);

  const save = (next: WorldWaypoint[]) => {
    setWaypoints(next);
    void api.setWorldWaypoints(root, next);
  };

  const add = () => {
    const pos = cameraPos().map((n) => Math.round(n)) as [number, number, number];
    const label = name.trim() || `${pos[0]}, ${pos[1]}, ${pos[2]}`;
    save([...waypoints, { name: label, pos, dimension: dim }]);
    setName('');
  };

  return (
    <div className="world-hud-waypoints">
      <form
        className="world-waypoint-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          type="text"
          value={name}
          placeholder={t('world.waypointName')}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="world-hud-btn primary" title={t('world.waypointAdd')} aria-label={t('world.waypointAdd')}>
          <Plus size={14} />
        </button>
      </form>
      {waypoints.length === 0 && <p className="world-waypoint-empty">{t('world.waypointEmpty')}</p>}
      <ul className="world-waypoint-list">
        {waypoints.map((wp, i) => (
          <li key={i}>
            <button
              type="button"
              className="world-waypoint-row"
              title={`${wp.pos.join(', ')}${wp.dimension !== dim ? ` · ${wp.dimension.replace('minecraft:', '')}` : ''}`}
              onClick={() => onJump(wp)}
            >
              <span className="world-waypoint-name">{wp.name}</span>
              <span className="world-waypoint-pos">{wp.pos.join(' ')}</span>
            </button>
            <button
              type="button"
              className="world-waypoint-del"
              title={t('world.waypointDelete')}
              aria-label={t('world.waypointDelete')}
              onClick={() => save(waypoints.filter((_, j) => j !== i))}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
