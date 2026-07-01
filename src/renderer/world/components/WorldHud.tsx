// The world-viewer HUD: floating overlays on the world-mode viewport. A top bar with the dimension
// switcher + render-distance control + jump-to-spawn/player + go-to-coordinate, and a bottom chip
// with the live coordinate readout + streaming indicator. Reads the world meta from the active doc
// and drives the viewer imperatively; glassy panels using the shared tokens.
import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Locate, MapPinned, Moon, Sun, UserRound } from 'lucide-react';
import type { DimensionId, StructureLocation } from '@/shared/types';
import { api } from '../../api';
import { useViewer } from '../../viewer/ViewerProvider';
import { useActiveDoc, useT } from '../../hooks/useStores';
import { Select } from '../../components/ui/Select';
import { Stepper } from '../../components/ui/Stepper';
import { Tooltip } from '../../components/ui/Tooltip';
import { WorldMinimap } from './WorldMinimap';

export function WorldHud() {
  const viewer = useViewer();
  const t = useT();
  const meta = useActiveDoc()?.worldMeta ?? null;

  const [coord, setCoord] = useState<[number, number, number]>([0, 0, 0]);
  const [stats, setStats] = useState({ loaded: 0, pending: 0 });
  const [dim, setDim] = useState<DimensionId>(meta?.dimensions[0]?.id ?? 'minecraft:overworld');
  const [renderDistance, setRenderDistance] = useState(10);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [day, setDay] = useState(true);
  const [target, setTarget] = useState<[number, number, number]>(meta?.spawn ?? [0, 64, 0]);
  const [structOpen, setStructOpen] = useState(false);
  const [structs, setStructs] = useState<StructureLocation[] | null>(null);
  const [structQuery, setStructQuery] = useState('');

  // Reset per-world state when the tab's world changes.
  useEffect(() => {
    setDim(meta?.dimensions[0]?.id ?? 'minecraft:overworld');
    setTarget(meta?.spawn ?? [0, 64, 0]);
    setStructs(null);
    setStructOpen(false);
  }, [meta?.root]);

  // Scan for structures on first open of the panel (per dimension); cached in main after that.
  useEffect(() => {
    if (!structOpen) return;
    setStructs(null);
    let live = true;
    void api.findWorldStructures(dim).then((s) => live && setStructs(s));
    return () => {
      live = false;
    };
  }, [structOpen, dim]);

  // Poll the camera + streaming stats each frame for the readout.
  useEffect(() => {
    if (!viewer) return;
    let raf = 0;
    const tick = () => {
      setCoord(viewer.cameraPosition());
      setStats(viewer.worldStats());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewer]);

  // Vanilla dimension names are localised; a mod dimension shows the label main derived from disk.
  const dimOptions = useMemo(
    () =>
      (meta?.dimensions ?? []).map((d) => ({
        value: d.id,
        label:
          d.id === 'minecraft:the_nether'
            ? t('world.dimNether')
            : d.id === 'minecraft:the_end'
              ? t('world.dimEnd')
              : d.id === 'minecraft:overworld'
                ? t('world.dimOverworld')
                : d.label,
      })),
    [meta?.dimensions, t],
  );

  if (!meta) return null;

  const changeDim = (d: DimensionId) => {
    setDim(d);
    viewer?.setWorldDimension(d);
  };
  const changeRender = (n: number) => {
    setRenderDistance(n);
    viewer?.setWorldRenderDistance(n);
  };
  const jump = (pos: [number, number, number]) => viewer?.goToWorldCoord(pos);

  return (
    <>
      <div className="world-hud-top">
        {dimOptions.length > 1 && (
          <div className="world-hud-dim">
            <Select value={dim} options={dimOptions} onChange={(v) => changeDim(v)} ariaLabel="Dimension" />
          </div>
        )}
        <div className="world-hud-controls">
          <Tooltip label={t('world.spawn')}>
            <button className="world-hud-btn" onClick={() => jump(meta.spawn)} aria-label={t('world.spawn')}>
              <Locate size={15} />
            </button>
          </Tooltip>
          {meta.player && (
            <Tooltip label={t('world.player')}>
              <button className="world-hud-btn" onClick={() => jump(meta.player!)} aria-label={t('world.player')}>
                <UserRound size={15} />
              </button>
            </Tooltip>
          )}
          <Tooltip label={t('world.goto')}>
            <button
              className={`world-hud-btn${gotoOpen ? ' active' : ''}`}
              onClick={() => setGotoOpen((o) => !o)}
              aria-label={t('world.goto')}
            >
              <Crosshair size={15} />
            </button>
          </Tooltip>
          <Tooltip label={t('world.structures')}>
            <button
              className={`world-hud-btn${structOpen ? ' active' : ''}`}
              onClick={() => setStructOpen((o) => !o)}
              aria-label={t('world.structures')}
            >
              <MapPinned size={15} />
            </button>
          </Tooltip>
          <Tooltip label={day ? t('world.night') : t('world.day')}>
            <button
              className="world-hud-btn"
              onClick={() => {
                const next = !day;
                setDay(next);
                viewer?.setDaylight(next);
              }}
              aria-label={day ? t('world.night') : t('world.day')}
            >
              {day ? <Moon size={15} /> : <Sun size={15} />}
            </button>
          </Tooltip>
          <label className="world-hud-render">
            <span>{t('world.renderDistance')}</span>
            <Stepper value={renderDistance} onChange={changeRender} min={4} max={32} step={2} size="sm" unit="ch" />
          </label>
        </div>

        {gotoOpen && (
          <form
            className="world-hud-goto"
            onSubmit={(e) => {
              e.preventDefault();
              jump(target);
              setGotoOpen(false);
            }}
          >
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <label key={axis}>
                {axis}
                <input
                  type="number"
                  value={target[i]}
                  onChange={(e) => {
                    const next = [...target] as [number, number, number];
                    next[i] = Number(e.target.value);
                    setTarget(next);
                  }}
                />
              </label>
            ))}
            <button type="submit" className="world-hud-btn primary">
              {t('world.go')}
            </button>
          </form>
        )}

        {structOpen && (
          <div className="world-hud-structs">
            <input
              className="world-hud-search"
              type="search"
              placeholder={t('world.searchStructures')}
              value={structQuery}
              onChange={(e) => setStructQuery(e.target.value)}
              autoFocus
            />
            {structs === null ? (
              <div className="world-hud-struct-empty">{t('world.scanning')}</div>
            ) : (
              (() => {
                const q = structQuery.trim().toLowerCase();
                const list = q ? structs.filter((s) => s.label.toLowerCase().includes(q)) : structs;
                return list.length === 0 ? (
                  <div className="world-hud-struct-empty">{t('world.noStructures')}</div>
                ) : (
                  <ul className="world-hud-struct-list">
                    {list.map((s, i) => (
                      <li key={`${s.id}-${i}`}>
                        <button
                          onClick={() => {
                            jump([s.x, s.y, s.z]);
                            setStructOpen(false);
                          }}
                        >
                          <span className="world-hud-struct-name">{s.label}</span>
                          <span className="world-hud-struct-pos">{s.x} {s.y} {s.z}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()
            )}
          </div>
        )}
      </div>

      <div className="world-hud">
        <div className="world-hud-coords">
          X {coord[0].toFixed(0)} · Y {coord[1].toFixed(0)} · Z {coord[2].toFixed(0)}
        </div>
        <div className="world-hud-stream">
          {stats.pending > 0 ? t('world.streaming', { loaded: stats.loaded }) : t('world.chunksLoaded', { loaded: stats.loaded })}
        </div>
      </div>

      <div className="world-hud-hint">{t('world.flyHint')}</div>
      <WorldMinimap />
    </>
  );
}
