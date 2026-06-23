// The block editor's live-symmetry plane: a translucent cobalt quad (with a brighter edge)
// through the structure's centre on the mirror axis, so you can SEE where Place/Delete will
// be mirrored. `set(axis, size)` draws it for the structure bounds; `clear()` removes it.
import * as THREE from 'three';
import { SceneOverlay } from './scene-overlay';
import { ACCENT } from './overlay-colors';

export class SymmetryOverlay extends SceneOverlay {
  // The plane is re-sized per `set`, so its geometry IS per-set — disposed on clear (below).
  private geos: THREE.BufferGeometry[] = [];
  private fillMat = new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private edgeMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.6 });

  /** Draw the mirror plane for `axis` ('x' → a YZ plane, 'z' → an XY plane) at the centre
   *  of a `size`-bounded structure. `null` clears it. */
  set(axis: 'x' | 'z' | null, size: [number, number, number]): void {
    this.clear();
    if (!axis) return;
    const [sx, sy, sz] = size;
    // PlaneGeometry lies in XY; for the X axis the mirror plane is YZ, so rotate it 90°.
    const geo = axis === 'x' ? new THREE.PlaneGeometry(sz, sy) : new THREE.PlaneGeometry(sx, sy);
    const edges = new THREE.EdgesGeometry(geo);
    this.geos.push(geo, edges);

    const group = new THREE.Group();
    const fill = new THREE.Mesh(geo, this.fillMat);
    const outline = new THREE.LineSegments(edges, this.edgeMat);
    if (axis === 'x') {
      fill.rotation.y = Math.PI / 2;
      outline.rotation.y = Math.PI / 2;
    }
    fill.position.set(sx / 2, sy / 2, sz / 2);
    outline.position.set(sx / 2, sy / 2, sz / 2);
    fill.renderOrder = 996;
    outline.renderOrder = 997;
    group.add(fill, outline);
    this.mount(group);
  }

  override clear(): void {
    super.clear();
    for (const g of this.geos) g.dispose();
    this.geos = [];
  }
}
