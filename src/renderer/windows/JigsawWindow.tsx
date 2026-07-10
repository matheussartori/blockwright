// Jigsaw assembly panel. The heavy lifting (pool resolution, alignment,
// validation) runs in main over IPC; here we trigger a seeded random assembly,
// load the resulting pieces' meshes through the viewer, and present the result.
// Manual per-connector piece selection was removed — assembly is random-only.
// Rendered as a tab in the docked sidebar (or a FloatingWindow when torn off);
// the chrome lives in InspectorDock / FloatingPanels.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JigsawPlan, JigsawPoolInfo, JigsawWarning, PlacedPiece, StructureData, WorkspaceJigsawPool } from '@/shared/types';
import { isJigsawSupported } from '@/shared/mc-version';
import { rootPlacement } from '@/shared/jigsaw';
import { buildConnectorMarkers, type ConnectorMarker } from '../viewer/jigsaw-markers';
import { api } from '../api';
import { useViewer } from '../viewer/ViewerProvider';
import { useApp, useSettings, useActiveDoc, useT } from '../hooks/useStores';
import { CommandChip } from '../components/ui/CommandChip';
import { settingsStore } from '../state/settings';
import { documentsStore } from '../state/documents';
import { loadDoc } from '../state/doc-loader';
import { basename } from '../ui/path';
import type { AssemblyPiece } from '../viewer/viewer';

const DEFAULT_DEPTH = 4;
const DEFAULT_SIM_SEEDS = 5;
const MAX_SIM_SEEDS = 16;

function short(id: string): string {
  return id.replace(/^minecraft:/, '');
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
/** Markers for the structure alone (no assembly): its connectors at the identity placement. */
function rootMarkers(structure: StructureData | null): ConnectorMarker[] {
  if (!structure || structure.jigsaws.length === 0) return [];
  return buildConnectorMarkers([{ id: 'root', jigsaws: structure.jigsaws, placement: rootPlacement() }]);
}

export function JigsawContent() {
  const t = useT();
  const structure = useActiveDoc()?.structure ?? null;
  const workspace = useApp((s) => s.workspace);
  const contentVersion = useApp((s) => s.contentVersion);
  const showJigsaw = useSettings((s) => s.showJigsaw);
  const hideShell = useSettings((s) => s.hideShell);
  const viewer = useViewer();

  const version = workspace ? workspace.minecraftVersion : contentVersion;
  const supported = isJigsawSupported(version);
  // Bumped by the Worldgen Studio's Save — pools on disk changed, re-read them.
  const worldgenRev = useApp((s) => s.worldgenRev);

  const [seed, setSeed] = useState(randomSeed);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [warnings, setWarnings] = useState<JigsawWarning[]>([]);
  const [pieceCount, setPieceCount] = useState(1);
  const [placed, setPlaced] = useState<PlacedPiece[]>([]);
  const [showConnectors, setShowConnectors] = useState(true);
  const [markers, setMarkers] = useState<ConnectorMarker[]>([]);
  const [poolsInfo, setPoolsInfo] = useState<JigsawPoolInfo[]>([]);
  const [simCount, setSimCount] = useState(DEFAULT_SIM_SEEDS);
  const [runs, setRuns] = useState<{ seed: number; plan: JigsawPlan }[]>([]);
  const [activeRun, setActiveRun] = useState<number | null>(null);

  // Pool → color, read off the live markers so the list chips always match the gizmos
  // (assembling can widen the pool set, which reshuffles the palette assignment).
  const poolColorOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of markers) if (!map.has(m.pool)) map.set(m.pool, m.color);
    return map;
  }, [markers]);

  // Push the markers into the viewer overlay; clear them when the panel unmounts.
  useEffect(() => {
    if (!viewer) return;
    viewer.setJigsawMarkers(supported && showConnectors ? markers : null);
    return () => viewer.setJigsawMarkers(null);
  }, [viewer, markers, showConnectors, supported]);

  // Resolve the structure's template pools for the inspector list (existence,
  // element count, fallback) — the same resolution the assembler draws from.
  useEffect(() => {
    setPoolsInfo([]);
    if (!structure || !supported || structure.jigsaws.length === 0) return;
    let stale = false;
    void api.jigsawPools(structure.path).then((pools) => {
      if (!stale) setPoolsInfo(pools ?? []);
    });
    return () => {
      stale = true;
    };
  }, [structure?.path, supported, worldgenRev]);

  // A run-scoped cache so re-rolls and repeated pieces don't reload the same file.
  const cache = useRef<Map<string, Promise<StructureData>>>(new Map());

  // The in-game test command: prefer a workspace pool that CONTAINS this piece
  // (`/place jigsaw <pool> <ownConnectorName> …` anchors on this structure when
  // it's picked); with none, fall back to expanding the first connector
  // (`/place jigsaw <its pool> <its target> …` — what vanilla does at that seam).
  const [pools, setPools] = useState<WorkspaceJigsawPool[]>([]);
  useEffect(() => {
    if (!workspace) {
      setPools([]);
      return;
    }
    let stale = false;
    void api.listWorkspaceJigsaws().then((list) => {
      if (!stale) setPools(list ?? []);
    });
    return () => {
      stale = true;
    };
  }, [workspace?.root, structure?.path]);

  const placeCommand = useMemo(() => {
    if (!structure || structure.jigsaws.length === 0) return null;
    const j = structure.jigsaws[0];
    const containing = pools.find((p) => p.pieces.some((piece) => piece.structurePath === structure.path));
    if (containing && j.name) return `/place jigsaw ${containing.id} ${j.name} 7 ~ ~ ~`;
    if (j.pool && j.pool !== 'minecraft:empty' && j.target) return `/place jigsaw ${j.pool} ${j.target} 7 ~ ~ ~`;
    return null;
  }, [structure, pools]);

  // Fresh structure → reset the cache, seed and transient UI.
  useEffect(() => {
    cache.current = new Map();
    if (structure) cache.current.set(structure.path, Promise.resolve(structure));
    setSeed(randomSeed());
    setWarnings([]);
    setPieceCount(1);
    setPlaced([]);
    setMarkers(rootMarkers(structure));
    setRuns([]);
    setActiveRun(null);
  }, [structure?.path]);

  // Dev-only (BW_ASSEMBLE): once the structure + viewer are ready, auto-run a
  // full assembly so the headless capture screenshots a village, not just the
  // root piece. Runs once per structure path.
  const autoRan = useRef<string | null>(null);
  useEffect(() => {
    if (!viewer || !structure || !supported) return;
    if (autoRan.current === structure.path) return;
    autoRan.current = structure.path;
    void (async () => {
      const cfg = await api.captureAssemble();
      if (!cfg) return;
      const plan = await api.assembleJigsaw(structure.path, { seed: cfg.seed, maxDepth: cfg.depth });
      const pieces = await Promise.all(
        plan.pieces.map(async (p) => ({
          data: await api.loadStructure(p.structurePath),
          offset: p.offset,
          quarterTurns: p.quarterTurns,
        })),
      );
      await viewer.showAssembly(pieces);
      setPieceCount(plan.pieces.length);
      setWarnings(plan.warnings);
      setMarkers(buildConnectorMarkers(plan.pieces.map((p, i) => ({
        id: p.id,
        jigsaws: pieces[i].data.jigsaws,
        placement: { offset: p.offset, quarterTurns: p.quarterTurns },
      }))));
    })();
  }, [viewer, structure?.path, supported]);

  if (!structure) return null;

  const loadData = (path: string): Promise<StructureData> => {
    let pending = cache.current.get(path);
    if (!pending) {
      pending = api.loadStructure(path);
      cache.current.set(path, pending);
    }
    return pending;
  };

  const loadPieces = (pieces: PlacedPiece[]): Promise<AssemblyPiece[]> =>
    Promise.all(
      pieces.map(async (p) => ({
        data: await loadData(p.structurePath),
        offset: p.offset,
        quarterTurns: p.quarterTurns,
      })),
    );

  // Load a plan's pieces and show it: meshes + warnings + connector gizmos for
  // EVERY placed piece, at their assembled placements. Shared by single assembly
  // and the seed simulator's run navigation.
  const applyPlan = async (plan: JigsawPlan) => {
    if (!viewer) return;
    const pieces = await loadPieces(plan.pieces);
    await viewer.showAssembly(pieces);
    setWarnings(plan.warnings);
    setPieceCount(plan.pieces.length);
    setPlaced(plan.pieces);
    setMarkers(buildConnectorMarkers(plan.pieces.map((p, i) => ({
      id: p.id,
      jigsaws: pieces[i].data.jigsaws,
      placement: { offset: p.offset, quarterTurns: p.quarterTurns },
    }))));
  };

  // Assemble with a given seed (defaults to the current one). Re-roll passes a
  // fresh seed directly since the state update is async.
  const assemble = async (withSeed: number = seed) => {
    const maxDepth = clamp(depth || DEFAULT_DEPTH, 1, 8);
    setBusy(true);
    try {
      const plan = await api.assembleJigsaw(structure.path, { seed: withSeed, maxDepth });
      await applyPlan(plan);
      setRuns([]);
      setActiveRun(null);
    } finally {
      setBusy(false);
    }
  };

  const reroll = () => {
    const next = randomSeed();
    setSeed(next);
    void assemble(next);
  };

  // The seed simulator: plan N random seeds in one go and keep every result so
  // the author can flip through variants without re-entering the game (or the
  // seed). Selecting a run re-shows it from the piece cache — no replanning.
  const simulate = async () => {
    const maxDepth = clamp(depth || DEFAULT_DEPTH, 1, 8);
    const count = clamp(simCount || DEFAULT_SIM_SEEDS, 2, MAX_SIM_SEEDS);
    setBusy(true);
    try {
      const seeds = Array.from({ length: count }, () => randomSeed());
      const next = await Promise.all(
        seeds.map(async (s) => ({ seed: s, plan: await api.assembleJigsaw(structure.path, { seed: s, maxDepth }) })),
      );
      setRuns(next);
      setActiveRun(0);
      setSeed(next[0].seed);
      await applyPlan(next[0].plan);
    } finally {
      setBusy(false);
    }
  };

  const selectRun = async (index: number) => {
    const run = runs[index];
    if (!run || busy) return;
    setActiveRun(index);
    setSeed(run.seed);
    setBusy(true);
    try {
      await applyPlan(run.plan);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!viewer) return;
    await viewer.show(structure);
    setWarnings([]);
    setPieceCount(1);
    setPlaced([]);
    setMarkers(rootMarkers(structure));
  };

  // Pool-author iteration: click a placed piece to open ITS file in a new tab.
  const openPiece = (path: string) => {
    const id = documentsStore.getState().openDoc(path);
    void loadDoc(id, path);
  };

  const count = structure.jigsaws.length;

  if (!supported) {
    return (
      <p className="bw-note">
        {t('jigsaw.unsupportedPre')}<strong>{version ?? t('jigsaw.thisVersion')}</strong>{t('jigsaw.unsupportedPost')}
      </p>
    );
  }

  return (
    <>
      <div className="bw-controls">
        <button
          className="btn primary sm grow"
          type="button"
          disabled={busy}
          onClick={() => void assemble()}
        >
          {t('jigsaw.generate')}
        </button>
        <button
          className="btn sm icon"
          type="button"
          disabled={busy}
          title={t('jigsaw.rerollTitle')}
          aria-label={t('jigsaw.rerollAria')}
          onClick={reroll}
        >
          ↻
        </button>
      </div>
      <div className="bw-controls">
        <button className="btn sm grow" type="button" disabled={busy} onClick={() => void simulate()}>
          {t('jigsaw.simulate')}
        </button>
        <button className="btn sm grow" type="button" onClick={() => void reset()}>
          {t('jigsaw.singlePiece')}
        </button>
      </div>

      <button
        className="bw-advanced-toggle"
        type="button"
        aria-expanded={advanced}
        onClick={() => setAdvanced((v) => !v)}
      >
        <span className={`bw-caret${advanced ? ' open' : ''}`}>▸</span> {t('jigsaw.advanced')}
      </button>
      {advanced && (
        <div className="bw-controls bw-advanced">
          <label className="bw-field">
            {t('jigsaw.depth')}
            <input
              type="number"
              min={1}
              max={8}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
            />
          </label>
          <label className="bw-field">
            {t('jigsaw.seed')}
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </label>
          <label className="bw-field">
            {t('jigsaw.simSeeds')}
            <input
              type="number"
              min={2}
              max={MAX_SIM_SEEDS}
              value={simCount}
              onChange={(e) => setSimCount(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {(pieceCount > 1 || warnings.length > 0) && (
        <div className="bw-warnings">
          {pieceCount > 1 && <div className="bw-ok">{t('jigsaw.placedPieces', { count: pieceCount })}</div>}
          {warnings.length > 0 && (
            <ul className="bw-warn-list">
              {warnings.map((w, i) => (
                <li key={i} className={`bw-warn bw-warn--${w.kind}`}>
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {runs.length > 0 && (
        <>
          <div className="bw-section">
            {t('jigsaw.seedsSection')} <span className="bw-count">{runs.length}</span>
          </div>
          <ul className="bw-rows">
            {runs.map((r, i) => (
              <li
                key={`${r.seed}:${i}`}
                className={`bw-row${i === activeRun ? ' bw-row-active' : ''}`}
                title={t('jigsaw.openRun')}
                onClick={() => void selectRun(i)}
              >
                <span className="bw-row-name bw-mono">{r.seed}</span>
                <span className="bw-row-tag">
                  {t('jigsaw.runPieces', { count: r.plan.pieces.length })}
                  {r.plan.warnings.length > 0 && ` · ⚠ ${r.plan.warnings.length}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="bw-section">{t('jigsaw.view')}</div>
      <label className="bw-toggle">
        <input
          type="checkbox"
          checked={showJigsaw}
          onChange={(e) => settingsStore.getState().set('showJigsaw', e.target.checked)}
        />
        <span>{t('jigsaw.showBlocks')}</span>
      </label>
      <label className="bw-toggle">
        <input
          type="checkbox"
          checked={hideShell}
          onChange={(e) => settingsStore.getState().set('hideShell', e.target.checked)}
        />
        <span>{t('jigsaw.hideShell')}</span>
      </label>
      <label className="bw-toggle">
        <input
          type="checkbox"
          checked={showConnectors}
          onChange={(e) => setShowConnectors(e.target.checked)}
        />
        <span>{t('jigsaw.showConnectors')}</span>
      </label>

      {placed.length > 1 && (
        <>
          <div className="bw-section">
            {t('jigsaw.pieces')} <span className="bw-count">{placed.length}</span>
          </div>
          <ul className="bw-rows">
            {placed.map((p, i) => (
              <li key={i} className="bw-row" title={t('jigsaw.openPiece')} onClick={() => openPiece(p.structurePath)}>
                <span className="bw-row-name">{basename(p.structurePath).replace(/\.nbt$/i, '')}</span>
                <span className="bw-row-tag">
                  {p.offset[0]},{p.offset[1]},{p.offset[2]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="bw-section">
        {t('jigsaw.connectors')} <span className="bw-count">{count}</span>
      </div>
      <ul className="bw-rows">
        {structure.jigsaws.map((j, i) => (
          <li
            key={i}
            className="bw-row static"
            title={j.orientation}
            onMouseEnter={() => viewer?.focusJigsawMarker(`root:${i}`)}
            onMouseLeave={() => viewer?.focusJigsawMarker(null)}
          >
            <span className="bw-pool-dot" style={{ background: cssColor(poolColorOf.get(j.pool) ?? 0x6b7280) }} />
            <span className="bw-row-name">{short(j.name) || t('jigsaw.unnamed')}</span>
            <span className="bw-row-arrow">→</span>
            <span className="bw-row-name">{short(j.target) || t('jigsaw.any')}</span>
            <span className="bw-row-tag">{short(j.pool)}</span>
          </li>
        ))}
      </ul>

      {poolsInfo.length > 0 && (
        <>
          <div className="bw-section">
            {t('jigsaw.poolsSection')} <span className="bw-count">{poolsInfo.length}</span>
          </div>
          <ul className="bw-rows">
            {poolsInfo.map((p) => {
              const missing = p.elements.filter((el) => !el.exists).length;
              return (
                <li key={p.id} className="bw-row static bw-pool-row" title={p.id}>
                  <span className="bw-pool-dot" style={{ background: cssColor(poolColorOf.get(p.id) ?? 0x6b7280) }} />
                  <span className="bw-row-name">{short(p.id)}</span>
                  {!p.exists ? (
                    <span className="bw-row-tag bw-tag-bad">{t('jigsaw.poolMissing')}</span>
                  ) : (
                    <span className="bw-row-tag">
                      {t('jigsaw.poolElements', { count: p.elements.length })}
                      {missing > 0 && ` · ${t('jigsaw.poolMissingPieces', { count: missing })}`}
                    </span>
                  )}
                  {p.fallback && p.fallback !== 'minecraft:empty' && (
                    <span className={`bw-row-tag${p.fallbackExists === false ? ' bw-tag-bad' : ''}`}>
                      ⤷ {short(p.fallback)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {placeCommand && <CommandChip command={placeCommand} hint={t('jigsaw.placeHint')} />}
    </>
  );
}
