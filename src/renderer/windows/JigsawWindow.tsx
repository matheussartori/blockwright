// Jigsaw assembly panel. The heavy lifting (pool resolution, alignment,
// validation) runs in main over IPC; here we trigger a seeded random assembly,
// load the resulting pieces' meshes through the viewer, and present the result.
// Manual per-connector piece selection was removed — assembly is random-only.
// Rendered as a tab in the docked sidebar (or a FloatingWindow when torn off);
// the chrome lives in InspectorDock / FloatingPanels.
import { useEffect, useRef, useState } from 'react';
import type { JigsawWarning, PlacedPiece, StructureData } from '@/shared/types';
import { isJigsawSupported } from '@/shared/mc-version';
import { api } from '../api';
import { useViewer } from '../viewer/ViewerProvider';
import { useApp, useSettings } from '../hooks/useStores';
import { settingsStore } from '../state/settings';
import type { AssemblyPiece } from '../viewer/viewer';

const DEFAULT_DEPTH = 4;

function short(id: string): string {
  return id.replace(/^minecraft:/, '');
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function JigsawContent() {
  const structure = useApp((s) => s.structure);
  const workspace = useApp((s) => s.workspace);
  const contentVersion = useApp((s) => s.contentVersion);
  const showJigsaw = useSettings((s) => s.showJigsaw);
  const hideShell = useSettings((s) => s.hideShell);
  const viewer = useViewer();

  const version = workspace ? workspace.minecraftVersion : contentVersion;
  const supported = isJigsawSupported(version);

  const [seed, setSeed] = useState(randomSeed);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [warnings, setWarnings] = useState<JigsawWarning[]>([]);
  const [pieceCount, setPieceCount] = useState(1);

  // A run-scoped cache so re-rolls and repeated pieces don't reload the same file.
  const cache = useRef<Map<string, Promise<StructureData>>>(new Map());

  // Fresh structure → reset the cache, seed and transient UI.
  useEffect(() => {
    cache.current = new Map();
    if (structure) cache.current.set(structure.path, Promise.resolve(structure));
    setSeed(randomSeed());
    setWarnings([]);
    setPieceCount(1);
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

  // Assemble with a given seed (defaults to the current one). Re-roll passes a
  // fresh seed directly since the state update is async.
  const assemble = async (withSeed: number = seed) => {
    if (!viewer) return;
    const maxDepth = clamp(depth || DEFAULT_DEPTH, 1, 8);
    setBusy(true);
    try {
      const plan = await api.assembleJigsaw(structure.path, { seed: withSeed, maxDepth });
      await viewer.showAssembly(await loadPieces(plan.pieces));
      setWarnings(plan.warnings);
      setPieceCount(plan.pieces.length);
    } finally {
      setBusy(false);
    }
  };

  const reroll = () => {
    const next = randomSeed();
    setSeed(next);
    void assemble(next);
  };

  const reset = async () => {
    if (!viewer) return;
    await viewer.show(structure);
    setWarnings([]);
    setPieceCount(1);
  };

  const count = structure.jigsaws.length;

  if (!supported) {
    return (
      <p className="bw-note">
        Jigsaw preview isn&apos;t supported for <strong>{version ?? 'this version'}</strong> yet.
        It&apos;s currently validated on 1.21.x.
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
          Generate
        </button>
        <button
          className="btn sm icon"
          type="button"
          disabled={busy}
          title="Randomize seed and re-assemble"
          aria-label="Re-roll"
          onClick={reroll}
        >
          ↻
        </button>
      </div>
      <div className="bw-controls">
        <button className="btn sm grow" type="button" onClick={() => void reset()}>
          Single piece
        </button>
      </div>

      <button
        className="bw-advanced-toggle"
        type="button"
        aria-expanded={advanced}
        onClick={() => setAdvanced((v) => !v)}
      >
        <span className={`bw-caret${advanced ? ' open' : ''}`}>▸</span> Advanced
      </button>
      {advanced && (
        <div className="bw-controls bw-advanced">
          <label className="bw-field">
            Depth
            <input
              type="number"
              min={1}
              max={8}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
            />
          </label>
          <label className="bw-field">
            Seed
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </label>
        </div>
      )}

      {(pieceCount > 1 || warnings.length > 0) && (
        <div className="bw-warnings">
          {pieceCount > 1 && <div className="bw-ok">Placed {pieceCount} pieces.</div>}
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

      <div className="bw-section">View</div>
      <label className="bw-toggle">
        <input
          type="checkbox"
          checked={showJigsaw}
          onChange={(e) => settingsStore.getState().set('showJigsaw', e.target.checked)}
        />
        <span>Show jigsaw blocks in viewer</span>
      </label>
      <label className="bw-toggle">
        <input
          type="checkbox"
          checked={hideShell}
          onChange={(e) => settingsStore.getState().set('hideShell', e.target.checked)}
        />
        <span>Hide piece shell (see inside)</span>
      </label>

      <div className="bw-section">
        Connectors <span className="bw-count">{count}</span>
      </div>
      <ul className="bw-rows">
        {structure.jigsaws.map((j, i) => (
          <li key={i} className="bw-row static" title={j.orientation}>
            <span className="bw-row-name">{short(j.name) || '(unnamed)'}</span>
            <span className="bw-row-arrow">→</span>
            <span className="bw-row-name">{short(j.target) || '(any)'}</span>
            <span className="bw-row-tag">{short(j.pool)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
