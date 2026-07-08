// The world-viewer HUD: floating overlays on the world-mode viewport. A top bar with the dimension
// switcher + render-distance control + jump-to-spawn/player + go-to-coordinate + find-structures +
// day/night, and a bottom chip with the live coordinate readout + streaming indicator. Reads the
// world meta from the active doc and drives the viewer imperatively; the go-to and structure panels
// are their own components (this file just orchestrates + composes them). Glassy panels via the
// shared tokens.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Crosshair, Frame, Layers, Locate, MapPinned, Moon, Pencil, ScanSearch, Sun, UserRound } from 'lucide-react';
import type { DimensionId, WorldWaypoint } from '@/shared/types';
import { api } from '../../api';
import { useViewer } from '../../viewer/ViewerProvider';
import { useActiveDoc, useSettings, useT, useWorldEdit } from '../../hooks/useStores';
import { store } from '../../state/store';
import { worldEditStore } from '../../state/world-edit';
import { Select } from '../../components/ui/Select';
import { Stepper } from '../../components/ui/Stepper';
import { Tooltip } from '../../components/ui/Tooltip';
import { WorldMinimap } from './WorldMinimap';
import { WorldGotoForm } from './WorldGotoForm';
import { WorldStructureFinder } from './WorldStructureFinder';
import { WorldBlockFinder } from './WorldBlockFinder';
import { WorldWaypoints } from './WorldWaypoints';
import { WorldYSlice } from './WorldYSlice';
import { lastDimension, rememberDimension } from '../../state/world-prefs';

export function WorldHud() {
  const viewer = useViewer();
  const t = useT();
  const meta = useActiveDoc()?.worldMeta ?? null;

  const [coord, setCoord] = useState<[number, number, number]>([0, 0, 0]);
  const [stats, setStats] = useState({ loaded: 0, pending: 0, missing: 0 });
  // Missing-texture diagnostics: meaningful only when a content pack resolves at all
  // (with none EVERYTHING is flat, which isn't a per-block miss — same rule as the Inspector).
  const [hasContent, setHasContent] = useState(false);
  const [missingList, setMissingList] = useState<string[]>([]);
  const [dim, setDim] = useState<DimensionId>(meta?.dimensions[0]?.id ?? 'minecraft:overworld');
  const defaultRenderDistance = useSettings((s) => s.worldRenderDistance);
  const defaultDimension = useSettings((s) => s.worldDefaultDimension);
  const [renderDistance, setRenderDistance] = useState(defaultRenderDistance);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [day, setDay] = useState(true);
  const [structOpen, setStructOpen] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [waypointsOpen, setWaypointsOpen] = useState(false);
  const [chunkGrid, setChunkGrid] = useState(false);
  const [sliceOpen, setSliceOpen] = useState(false);
  const [sliceActive, setSliceActive] = useState(false);
  const worldEditing = useSettings((s) => s.worldEditing);
  const cursorReadout = useSettings((s) => s.cursorReadout);
  const editActive = useWorldEdit((s) => s.active);
  const editOpening = useWorldEdit((s) => s.opening);
  // The cell under the pointer (crosshair in fly mode), named — the F3 essentials.
  const [cursor, setCursor] = useState<{ pos: [number, number, number]; block: string; biome: string | null } | null>(null);
  const pointer = useRef<[number, number] | null>(null);

  // Reset per-world state + close the panels when the tab's world changes. An edit session on
  // the previous world must not survive it (pending edits are dropped — the session is per-world).
  // The dimension restores the LAST one viewed for this world when Settings ▸ World says so.
  useEffect(() => {
    const first = meta?.dimensions[0]?.id ?? 'minecraft:overworld';
    const remembered = defaultDimension === 'last' && meta ? lastDimension(meta.root) : null;
    const start = remembered && meta?.dimensions.some((d) => d.id === remembered) ? remembered : first;
    setDim(start);
    if (start !== first) viewer?.setWorldDimension(start);
    setRenderDistance(defaultRenderDistance); // the WorldView opened at this default too
    setGotoOpen(false);
    setStructOpen(false);
    setBlocksOpen(false);
    setWaypointsOpen(false);
    setSliceOpen(false);
    if (worldEditStore.getState().active) void worldEditStore.getState().exit();
  }, [meta?.root]);

  // Poll the camera + streaming stats each frame for the readout. The missing-texture LIST is
  // fetched only when its tally changes (the per-frame stats carry just the cheap count).
  // The cursor readout raycasts the aim point per frame (the pointer, or the crosshair in fly
  // mode) — same per-frame budget the edit layer's hover already spends.
  useEffect(() => {
    if (!viewer) return;
    let raf = 0;
    let lastMissing = -1;
    const aimPoint = (): [number, number] | null => {
      if (!viewer.flying) return pointer.current;
      const rect = viewer.domElement.getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };
    const tick = () => {
      setCoord(viewer.cameraPosition());
      const s = viewer.worldStats();
      setStats(s);
      if (s.missing !== lastMissing) {
        lastMissing = s.missing;
        setMissingList(viewer.worldMissingTextures());
      }
      if (cursorReadout !== 'coords') {
        const aim = aimPoint();
        setCursor(aim ? viewer.identifyWorldCell(aim[0], aim[1]) : null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewer, cursorReadout]);

  // Track the pointer over the viewport for the cursor readout's aim point.
  useEffect(() => {
    if (!viewer || cursorReadout === 'coords') return;
    const canvas = viewer.domElement;
    const onMove = (e: PointerEvent) => {
      pointer.current = [e.clientX, e.clientY];
    };
    const onLeave = () => {
      pointer.current = null;
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [viewer, cursorReadout]);

  // Whether a content pack resolves at all (gates the missing-texture chip).
  useEffect(() => {
    void api.getContentDir().then((dir) => setHasContent(dir !== null));
  }, []);

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
    if (worldEditStore.getState().active) return; // an edit session is per-dimension
    setDim(d);
    viewer?.setWorldDimension(d);
    if (meta) rememberDimension(meta.root, d);
  };
  // Entering edit is gated on the Settings ▸ World master switch (worlds are read-only until the
  // user opts in) — when off, the button deep-links to that settings tab instead.
  const toggleEdit = () => {
    const we = worldEditStore.getState();
    if (we.active) {
      if (we.pendingCount > 0) we.setSaveOpen(true);
      else void we.exit();
      return;
    }
    if (!worldEditing) {
      store.getState().setSettingsSection('world');
      store.getState().setSettingsOpen(true);
      return;
    }
    void we.enter(dim);
  };
  const changeRender = (n: number) => {
    setRenderDistance(n);
    viewer?.setWorldRenderDistance(n);
  };
  const jump = (pos: [number, number, number]) => viewer?.goToWorldCoord(pos);
  // A waypoint jump restores its dimension first (no-op while editing — dim is locked).
  const jumpWaypoint = (wp: WorldWaypoint) => {
    if (wp.dimension !== dim) {
      if (worldEditStore.getState().active) return;
      changeDim(wp.dimension);
    }
    jump(wp.pos);
    setWaypointsOpen(false);
  };

  return (
    <>
      <div className="world-hud-top">
        {dimOptions.length > 1 && (
          <div className="world-hud-dim">
            <Select value={dim} options={dimOptions} onChange={(v) => changeDim(v)} ariaLabel="Dimension" />
          </div>
        )}
        <div className="world-hud-controls">
          <Tooltip label={t('worldEdit.toggle')} description={worldEditing ? t('worldEdit.toggleDesc') : t('worldEdit.toggleOff')}>
            <button
              className={`world-hud-btn${editActive ? ' active' : ''}`}
              onClick={toggleEdit}
              disabled={editOpening}
              aria-label={t('worldEdit.toggle')}
              aria-pressed={editActive}
            >
              <Pencil size={15} />
            </button>
          </Tooltip>
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
          <Tooltip label={t('world.waypoints')} description={t('world.waypointsDesc')}>
            <button
              className={`world-hud-btn${waypointsOpen ? ' active' : ''}`}
              onClick={() => setWaypointsOpen((o) => !o)}
              aria-label={t('world.waypoints')}
            >
              <Bookmark size={15} />
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
          <Tooltip label={t('world.findBlocks')} description={t('world.findBlocksDesc')}>
            <button
              className={`world-hud-btn${blocksOpen ? ' active' : ''}`}
              onClick={() => setBlocksOpen((o) => !o)}
              aria-label={t('world.findBlocks')}
            >
              <ScanSearch size={15} />
            </button>
          </Tooltip>
          <Tooltip label={t('world.ySlice')} description={t('world.ySliceDesc')}>
            <button
              className={`world-hud-btn${sliceOpen || sliceActive ? ' active' : ''}`}
              onClick={() => setSliceOpen((o) => !o)}
              aria-label={t('world.ySlice')}
              aria-pressed={sliceActive}
            >
              <Layers size={15} />
            </button>
          </Tooltip>
          <Tooltip label={t('world.chunkGrid')} description={t('world.chunkGridDesc')}>
            <button
              className={`world-hud-btn${chunkGrid ? ' active' : ''}`}
              onClick={() => {
                const next = !chunkGrid;
                setChunkGrid(next);
                viewer?.setWorldChunkGrid(next);
              }}
              aria-label={t('world.chunkGrid')}
              aria-pressed={chunkGrid}
            >
              <Frame size={15} />
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
          <WorldGotoForm
            initial={meta.spawn}
            onJump={(pos) => {
              jump(pos);
              setGotoOpen(false);
            }}
          />
        )}

        {structOpen && (
          <WorldStructureFinder
            dim={dim}
            onJump={(pos) => {
              jump(pos);
              setStructOpen(false);
            }}
          />
        )}

        {blocksOpen && <WorldBlockFinder onJump={jump} />}

        <WorldYSlice key={meta.root} root={meta.root} open={sliceOpen} onActive={setSliceActive} />

        {waypointsOpen && (
          <WorldWaypoints
            root={meta.root}
            dim={dim}
            cameraPos={() => viewer?.cameraPosition() ?? [0, 0, 0]}
            onJump={jumpWaypoint}
          />
        )}
      </div>

      <div className="world-hud">
        <div className="world-hud-coords">
          X {coord[0].toFixed(0)} · Y {coord[1].toFixed(0)} · Z {coord[2].toFixed(0)}
        </div>
        {cursorReadout !== 'coords' && cursor && (
          <div className="world-hud-cursor" title={t('world.cursorTitle')}>
            ⌖ {cursor.pos.join(' ')} · {cursor.block.replace('minecraft:', '')}
            {cursorReadout === 'biome' && cursor.biome && <> · {cursor.biome.replace('minecraft:', '')}</>}
          </div>
        )}
        <div className="world-hud-stream">
          {stats.pending > 0 ? t('world.streaming', { loaded: stats.loaded }) : t('world.chunksLoaded', { loaded: stats.loaded })}
        </div>
        {hasContent && stats.missing > 0 && (
          <div className="world-hud-missing" title={missingList.join('\n')}>
            {t('world.missingTex', { n: stats.missing })}
          </div>
        )}
      </div>

      <div className="world-hud-hint">{t('world.flyHint')}</div>
      <WorldMinimap />
    </>
  );
}
