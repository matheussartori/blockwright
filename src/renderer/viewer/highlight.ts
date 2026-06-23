// The focus highlight: a transient translucent box flashed over a block the user
// clicked in the inspector, so it's easy to spot among neighbours. Drawn without
// depth-testing so it shows through other blocks, and faded out over ~1s. The camera
// move that centres the block stays in the Viewer; this owns only the box + its fade.
import * as THREE from 'three';
import { FOCUS } from './overlay-colors';

/** How long the focus highlight stays on screen (ms). */
const HIGHLIGHT_MS = 1000;

export class FocusHighlight {
  private mesh: THREE.Mesh | null = null;
  private until = 0;

  constructor(private scene: THREE.Scene) {}

  /** Flash a highlight box centred on `center` (world coords). */
  flash(center: THREE.Vector3): void {
    this.clear();
    const geo = new THREE.BoxGeometry(1.06, 1.06, 1.06);
    const mat = new THREE.MeshBasicMaterial({
      color: FOCUS,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.renderOrder = 999;
    this.scene.add(mesh);
    this.mesh = mesh;
    this.until = performance.now() + HIGHLIGHT_MS;
  }

  /** Advance the fade; drop the box once it expires. Called each frame. */
  update(): void {
    if (!this.mesh) return;
    const remaining = this.until - performance.now();
    if (remaining <= 0) {
      this.clear();
      return;
    }
    const t = remaining / HIGHLIGHT_MS; // 1 → 0
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.55 * t;
  }

  /** Remove the highlight box if present. */
  clear(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
  }
}
