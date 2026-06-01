// Jigsaw assembly window. The heavy lifting (pool resolution, alignment,
// validation) runs in main over IPC; here we trigger it, load the resulting
// pieces' meshes through the viewer, and present controls/connectors/warnings.
// Version gating mirrors the active context (workspace, or the bundled pack).
import { useEffect, useRef, useState } from 'react';
import type {
  JigsawCandidate,
  JigsawWarning,
  PlacedPiece,
  StructureData,
} from '@/shared/types';
import { isJigsawSupported } from '@/shared/mc-version';
import { api } from '../api';
import { FloatingWindow } from '../components/FloatingWindow';
import { useViewer } from '../viewer/ViewerProvider';
import { useApp } from '../hooks/useStores';
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

interface CandidatePanel {
  index: number;
  loading: boolean;
  list: JigsawCandidate[];
}

export function JigsawWindow({ available }: { available: boolean }) {
  const structure = useApp((s) => s.structure);
  const workspace = useApp((s) => s.workspace);
  const contentVersion = useApp((s) => s.contentVersion);
  const viewer = useViewer();

  const version = workspace ? workspace.minecraftVersion : contentVersion;
  const supported = isJigsawSupported(version);

  const [seed, setSeed] = useState(randomSeed);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<JigsawWarning[]>([]);
  const [pieceCount, setPieceCount] = useState(1);
  const [candidates, setCandidates] = useState<CandidatePanel | null>(null);

  // A run-scoped cache so re-rolls and repeated pieces don't reload the same file.
  const cache = useRef<Map<string, Promise<StructureData>>>(new Map());

  // Fresh structure → reset the cache, seed and transient UI.
  useEffect(() => {
    cache.current = new Map();
    if (structure) cache.current.set(structure.path, Promise.resolve(structure));
    setSeed(randomSeed());
    setWarnings([]);
    setPieceCount(1);
    setCandidates(null);
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

  const assemble = async () => {
    if (!viewer) return;
    const maxDepth = clamp(depth || DEFAULT_DEPTH, 1, 8);
    setBusy(true);
    try {
      const plan = await api.assembleJigsaw(structure.path, { seed, maxDepth });
      await viewer.showAssembly(await loadPieces(plan.pieces));
      setWarnings(plan.warnings);
      setPieceCount(plan.pieces.length);
      setCandidates(null);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!viewer) return;
    await viewer.show(structure);
    setWarnings([]);
    setPieceCount(1);
    setCandidates(null);
  };

  const reroll = () => {
    const next = randomSeed();
    setSeed(next);
    // Assemble with the fresh seed directly (state update is async).
    void (async () => {
      if (!viewer) return;
      const maxDepth = clamp(depth || DEFAULT_DEPTH, 1, 8);
      setBusy(true);
      try {
        const plan = await api.assembleJigsaw(structure.path, { seed: next, maxDepth });
        await viewer.showAssembly(await loadPieces(plan.pieces));
        setWarnings(plan.warnings);
        setPieceCount(plan.pieces.length);
        setCandidates(null);
      } finally {
        setBusy(false);
      }
    })();
  };

  const openCandidates = async (index: number) => {
    setCandidates({ index, loading: true, list: [] });
    const list = await api.jigsawCandidates(structure.path, index);
    setCandidates({ index, loading: false, list });
  };

  const showCandidate = async (candidate: JigsawCandidate) => {
    if (!viewer) return;
    const child = await loadData(candidate.structurePath);
    await viewer.showAssembly([
      { data: structure, offset: [0, 0, 0], quarterTurns: 0 },
      {
        data: child,
        offset: candidate.placement.offset,
        quarterTurns: candidate.placement.quarterTurns,
      },
    ]);
  };

  const count = structure.jigsaws.length;
  const header = (
    <span className="bw-count">
      {count} connector{count === 1 ? '' : 's'}
    </span>
  );

  return (
    <FloatingWindow id="jigsaw" title="Jigsaw" available={available} headerExtra={header}>
      {!supported ? (
        <p className="bw-note">
          Jigsaw preview isn&apos;t supported for <strong>{version ?? 'this version'}</strong> yet.
          It&apos;s currently validated on 1.21.x.
        </p>
      ) : (
        <>
          <div className="bw-controls">
            <button className="btn primary sm" type="button" disabled={busy} onClick={() => void assemble()}>
              Auto-assemble
            </button>
            <button className="btn sm" type="button" onClick={() => void reset()}>
              Single piece
            </button>
          </div>
          <div className="bw-controls">
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
            <button
              className="link"
              type="button"
              disabled={busy}
              title="Randomize seed and re-assemble"
              onClick={reroll}
            >
              ↻ re-roll
            </button>
          </div>

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

          <div className="bw-section">Connectors</div>
          <ul className="bw-rows">
            {structure.jigsaws.map((j, i) => (
              <li
                key={i}
                className="bw-row"
                title={j.orientation}
                onClick={() => void openCandidates(i)}
              >
                <span className="bw-row-name">{short(j.name) || '(unnamed)'}</span>
                <span className="bw-row-arrow">→</span>
                <span className="bw-row-name">{short(j.target) || '(any)'}</span>
                <span className="bw-row-tag">{short(j.pool)}</span>
              </li>
            ))}
          </ul>

          {candidates && (
            <div className="bw-candidates">
              {candidates.loading ? (
                <p className="bw-note">Finding candidates…</p>
              ) : candidates.list.length === 0 ? (
                <p className="bw-note">No matching pieces for this connector.</p>
              ) : (
                <>
                  <div className="bw-section">Attach a piece</div>
                  <ul className="bw-rows">
                    {candidates.list.map((c, i) => (
                      <li key={i} className="bw-row" onClick={() => void showCandidate(c)}>
                        <span className="bw-row-name">{short(c.structureId)}</span>
                        <span className="bw-row-tag">w{c.weight}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </FloatingWindow>
  );
}
