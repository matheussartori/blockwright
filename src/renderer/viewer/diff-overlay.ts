// The structure-diff overlay: one tinted marker per differing cell over the CURRENT build.
// Added/changed cells hold a real block in the shown structure, so they get a slightly
// OVERSIZED shell around it (an inset marker would be buried inside the block); removed
// cells are empty in the shown structure, so they get an inset ghost box where the block
// used to be. depthTest stays ON — markers occlude like geometry, keeping depth readable.
// Like the floor bands, the DESIRED cells persist across rebuilds: `clearMeshes` drops the
// meshes, `reapply` re-renders the same diff after the next show.
import * as THREE from 'three';
import { SceneOverlay } from './scene-overlay';
import { parseCell } from '../editor/cell-key';
import { DIFF_ADD, DIFF_CHANGE, DIFF_REMOVE } from './overlay-colors';
import type { DiffCellMark, DiffKind } from '../diff/diff';

export class DiffOverlay extends SceneOverlay {
  // Shells wrap the block that's there (added/changed); the ghost sits where one is gone.
  private shell = new THREE.BoxGeometry(1.04, 1.04, 1.04);
  private shellEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 1.05, 1.05));
  private ghost = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  private ghostEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.64, 0.64, 0.64));
  private fill: Record<DiffKind, THREE.MeshBasicMaterial> = {
    added: new THREE.MeshBasicMaterial({ color: DIFF_ADD, transparent: true, opacity: 0.22, depthWrite: false }),
    changed: new THREE.MeshBasicMaterial({ color: DIFF_CHANGE, transparent: true, opacity: 0.22, depthWrite: false }),
    removed: new THREE.MeshBasicMaterial({ color: DIFF_REMOVE, transparent: true, opacity: 0.18, depthWrite: false }),
  };
  private line: Record<DiffKind, THREE.LineBasicMaterial> = {
    added: new THREE.LineBasicMaterial({ color: DIFF_ADD, transparent: true, opacity: 0.9 }),
    changed: new THREE.LineBasicMaterial({ color: DIFF_CHANGE, transparent: true, opacity: 0.9 }),
    removed: new THREE.LineBasicMaterial({ color: DIFF_REMOVE, transparent: true, opacity: 0.9 }),
  };
  private cells: DiffCellMark[] = [];

  /** Show these diff marks (empty array = hide) — remembered across rebuilds. */
  set(cells: DiffCellMark[]): void {
    this.cells = cells;
    this.render();
  }

  /** Drop the meshes but KEEP the desired cells (a rebuild re-applies them). */
  clearMeshes(): void {
    this.clear();
  }

  /** Re-render the remembered diff after a rebuild (no-op when there is none). */
  reapply(): void {
    this.render();
  }

  private render(): void {
    this.clear();
    if (!this.cells.length) return;
    const group = new THREE.Group();
    for (const { key, kind } of this.cells) {
      const [x, y, z] = parseCell(key);
      const removed = kind === 'removed';
      const wire = new THREE.LineSegments(removed ? this.ghostEdges : this.shellEdges, this.line[kind]);
      wire.position.set(x + 0.5, y + 0.5, z + 0.5);
      group.add(wire);
      const mesh = new THREE.Mesh(removed ? this.ghost : this.shell, this.fill[kind]);
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      group.add(mesh);
    }
    this.mount(group);
  }
}
