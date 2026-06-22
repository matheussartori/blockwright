// The block editor's selection overlay: a cobalt outlined box + translucent fill over
// every selected cell, drawn on top of the geometry (depthTest off) like the inspector's
// focus highlight. One reused edge/box geometry backs every cell, so a big selection is
// cheap. `set` replaces the whole overlay; `clear` removes it.
import * as THREE from 'three';

const ACCENT = 0x3b6fe5;

export class SelectionOverlay {
  private group: THREE.Group | null = null;
  private edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001));
  private cube = new THREE.BoxGeometry(1, 1, 1);
  private lineMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95, depthTest: false });
  private fillMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.16, depthTest: false });

  constructor(private scene: THREE.Scene) {}

  set(cells: string[]): void {
    this.clear();
    if (!cells.length) return;
    const group = new THREE.Group();
    for (const k of cells) {
      const [x, y, z] = k.split(',').map(Number);
      const fill = new THREE.Mesh(this.cube, this.fillMat);
      fill.position.set(x + 0.5, y + 0.5, z + 0.5);
      fill.renderOrder = 997;
      group.add(fill);
      const line = new THREE.LineSegments(this.edges, this.lineMat);
      line.position.set(x + 0.5, y + 0.5, z + 0.5);
      line.renderOrder = 998;
      group.add(line);
    }
    this.scene.add(group);
    this.group = group;
  }

  clear(): void {
    if (!this.group) return;
    this.scene.remove(this.group); // meshes share the overlay's reused geometry — nothing to dispose per-clear
    this.group = null;
  }
}
