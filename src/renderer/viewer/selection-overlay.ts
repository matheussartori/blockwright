// The block editor's selection overlay: a cobalt outlined box + translucent fill over
// every selected cell, drawn on top of the geometry (depthTest off) like the inspector's
// focus highlight. One reused edge/box geometry backs every cell, so a big selection is
// cheap. `set` replaces the whole overlay; `clear` removes it.
import * as THREE from 'three';
import { SceneOverlay } from './scene-overlay';
import { parseCell } from '../editor/cell-key';
import { ACCENT } from './overlay-colors';

export class SelectionOverlay extends SceneOverlay {
  // One reused edge/box geometry + material backs every cell, so a big selection is cheap;
  // they outlive any single `set`, so the base `clear()` (which doesn't dispose) is correct.
  private edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001));
  private cube = new THREE.BoxGeometry(1, 1, 1);
  private lineMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95, depthTest: false });
  private fillMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.16, depthTest: false });

  set(cells: string[]): void {
    this.clear();
    if (!cells.length) return;
    const group = new THREE.Group();
    for (const k of cells) {
      const [x, y, z] = parseCell(k);
      const fill = new THREE.Mesh(this.cube, this.fillMat);
      fill.position.set(x + 0.5, y + 0.5, z + 0.5);
      fill.renderOrder = 997;
      group.add(fill);
      const line = new THREE.LineSegments(this.edges, this.lineMat);
      line.position.set(x + 0.5, y + 0.5, z + 0.5);
      line.renderOrder = 998;
      group.add(line);
    }
    this.mount(group);
  }
}
