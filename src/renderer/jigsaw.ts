// Renderer-side jigsaw feature: owns the jigsaw panel and drives the viewer to
// show assemblies. The heavy lifting (pool resolution, alignment, validation)
// happens in main via IPC; here we trigger it, load the resulting pieces'
// meshes, and present the controls/warnings. Version gating is decided by the
// caller and passed in, so this stays a pure view+orchestration layer.
import type { JigsawCandidate, JigsawWarning, PlacedPiece, StructureData } from '@/shared/types';
import type { AssemblyPiece, Viewer } from './viewer/viewer';
import { escapeHtml } from './ui/html';

const api = window.blockwright;
const DEFAULT_DEPTH = 4;

/** A run-scoped cache so re-rolls and repeated pieces don't reload the same file. */
type DataCache = Map<string, Promise<StructureData>>;

export class JigsawController {
  private root: StructureData | null = null;
  private supported = false;
  private version: string | null = null;
  private seed = randomSeed();
  private cache: DataCache = new Map();

  constructor(
    private panel: HTMLElement,
    private viewer: Viewer,
  ) {}

  /** Update the panel for the freshly loaded structure. `supported`/`version`
   *  reflect whether jigsaw rendering is available for the active context. */
  setStructure(data: StructureData | null, supported: boolean, version: string | null): void {
    this.root = data;
    this.supported = supported;
    this.version = version;
    this.cache = new Map();
    if (data) this.cache.set(data.path, Promise.resolve(data));

    if (!data || data.jigsaws.length === 0) {
      this.hide();
      return;
    }
    this.render(data);
  }

  private hide(): void {
    this.panel.classList.add('hidden');
    this.panel.innerHTML = '';
  }

  private render(data: StructureData): void {
    const count = data.jigsaws.length;
    this.panel.classList.remove('hidden');

    if (!this.supported) {
      this.panel.innerHTML = `
        <div class="jp-head">
          <span class="jp-title">Jigsaw</span>
          <span class="jp-count">${count} connector${count === 1 ? '' : 's'}</span>
        </div>
        <div class="jp-body">
          <p class="jp-note">Jigsaw preview isn't supported for
            <strong>${escapeHtml(this.version ?? 'this version')}</strong> yet.
            It's currently validated on 1.21.x.</p>
        </div>`;
      return;
    }

    this.panel.innerHTML = `
      <div class="jp-head">
        <span class="jp-title">Jigsaw</span>
        <span class="jp-count">${count} connector${count === 1 ? '' : 's'}</span>
      </div>
      <div class="jp-body">
        <div class="jp-controls">
          <button class="btn primary jp-assemble" type="button">Auto-assemble</button>
          <button class="btn jp-reset" type="button">Single piece</button>
        </div>
        <div class="jp-controls">
          <label class="jp-field">Depth
            <input class="jp-depth" type="number" min="1" max="8" value="${DEFAULT_DEPTH}">
          </label>
          <label class="jp-field">Seed
            <input class="jp-seed" type="number" value="${this.seed}">
          </label>
          <button class="link jp-reroll" type="button" title="Randomize seed and re-assemble">↻ re-roll</button>
        </div>
        <div class="jp-warnings"></div>
        <div class="jp-section">Connectors</div>
        <ul class="jp-connectors">
          ${data.jigsaws
            .map(
              (j, i) => `<li class="jp-conn" data-index="${i}" title="${escapeHtml(j.orientation)}">
                <span class="jp-conn-name">${escapeHtml(short(j.name) || '(unnamed)')}</span>
                <span class="jp-conn-arrow">→</span>
                <span class="jp-conn-target">${escapeHtml(short(j.target) || '(any)')}</span>
                <span class="jp-conn-pool">${escapeHtml(short(j.pool))}</span>
              </li>`,
            )
            .join('')}
        </ul>
        <div class="jp-candidates hidden"></div>
      </div>`;

    this.wire();
  }

  private wire(): void {
    this.q('.jp-assemble')?.addEventListener('click', () => void this.assemble());
    this.q('.jp-reset')?.addEventListener('click', () => void this.reset());
    this.q('.jp-reroll')?.addEventListener('click', () => {
      this.seed = randomSeed();
      this.seedInput().value = String(this.seed);
      void this.assemble();
    });
    this.panel.querySelectorAll<HTMLElement>('.jp-conn').forEach((row) => {
      row.addEventListener('click', () => void this.openCandidates(Number(row.dataset.index)));
    });
  }

  // --- Auto-assemble ---------------------------------------------------------

  private async assemble(): Promise<void> {
    if (!this.root) return;
    this.seed = Number(this.seedInput().value) || this.seed;
    const maxDepth = clamp(Number(this.depthInput().value) || DEFAULT_DEPTH, 1, 8);
    this.setBusy(true);
    try {
      const plan = await api.assembleJigsaw(this.root.path, { seed: this.seed, maxDepth });
      await this.viewer.showAssembly(await this.loadPieces(plan.pieces));
      this.renderWarnings(plan.warnings, plan.pieces.length);
      this.clearCandidates();
    } finally {
      this.setBusy(false);
    }
  }

  /** Return to showing just the root structure. */
  private async reset(): Promise<void> {
    if (!this.root) return;
    await this.viewer.show(this.root);
    this.renderWarnings([], 1);
    this.clearCandidates();
  }

  // --- Manual mode -----------------------------------------------------------

  private async openCandidates(index: number): Promise<void> {
    if (!this.root) return;
    const box = this.q('.jp-candidates')!;
    box.classList.remove('hidden');
    box.innerHTML = '<p class="jp-note">Finding candidates…</p>';
    const candidates = await api.jigsawCandidates(this.root.path, index);
    if (candidates.length === 0) {
      box.innerHTML = '<p class="jp-note">No matching pieces for this connector.</p>';
      return;
    }
    box.innerHTML = `
      <div class="jp-section">Attach a piece</div>
      <ul class="jp-cand-list">
        ${candidates
          .map(
            (c, i) => `<li class="jp-cand" data-index="${i}">
              <span class="jp-cand-name">${escapeHtml(short(c.structureId))}</span>
              <span class="jp-cand-weight">w${c.weight}</span>
            </li>`,
          )
          .join('')}
      </ul>`;
    box.querySelectorAll<HTMLElement>('.jp-cand').forEach((row, i) => {
      row.addEventListener('click', () => void this.showCandidate(candidates[i]));
    });
  }

  private async showCandidate(candidate: JigsawCandidate): Promise<void> {
    if (!this.root) return;
    const child = await this.loadData(candidate.structurePath);
    await this.viewer.showAssembly([
      { data: this.root, offset: [0, 0, 0], quarterTurns: 0 },
      {
        data: child,
        offset: candidate.placement.offset,
        quarterTurns: candidate.placement.quarterTurns,
      },
    ]);
  }

  // --- Helpers ---------------------------------------------------------------

  private async loadPieces(pieces: PlacedPiece[]): Promise<AssemblyPiece[]> {
    return Promise.all(
      pieces.map(async (p) => ({
        data: await this.loadData(p.structurePath),
        offset: p.offset,
        quarterTurns: p.quarterTurns,
      })),
    );
  }

  private loadData(path: string): Promise<StructureData> {
    let pending = this.cache.get(path);
    if (!pending) {
      pending = api.loadStructure(path);
      this.cache.set(path, pending);
    }
    return pending;
  }

  private renderWarnings(warnings: JigsawWarning[], pieceCount: number): void {
    const box = this.q('.jp-warnings');
    if (!box) return;
    const summary = pieceCount > 1 ? `<div class="jp-ok">Placed ${pieceCount} pieces.</div>` : '';
    if (warnings.length === 0) {
      box.innerHTML = summary;
      return;
    }
    box.innerHTML =
      summary +
      `<ul class="jp-warn-list">
        ${warnings
          .map((w) => `<li class="jp-warn jp-warn--${escapeHtml(w.kind)}">${escapeHtml(w.message)}</li>`)
          .join('')}
      </ul>`;
  }

  private clearCandidates(): void {
    const box = this.q('.jp-candidates');
    if (box) {
      box.classList.add('hidden');
      box.innerHTML = '';
    }
  }

  private setBusy(busy: boolean): void {
    this.q<HTMLButtonElement>('.jp-assemble')?.toggleAttribute('disabled', busy);
    this.q<HTMLButtonElement>('.jp-reroll')?.toggleAttribute('disabled', busy);
  }

  private depthInput(): HTMLInputElement {
    return this.q<HTMLInputElement>('.jp-depth')!;
  }
  private seedInput(): HTMLInputElement {
    return this.q<HTMLInputElement>('.jp-seed')!;
  }
  private q<T extends HTMLElement>(sel: string): T | null {
    return this.panel.querySelector<T>(sel);
  }
}

function short(id: string): string {
  return id.replace(/^minecraft:/, '');
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
