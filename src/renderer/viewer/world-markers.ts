// Find-blocks result markers in the world scene: one InstancedMesh of slightly-oversized
// translucent cubes (depthTest off, so buried ore/spawners show through terrain), amber like
// the inspector's focus flash. `noPick` so the world editor's raycasts ignore them.
import * as THREE from 'three';
import { FOCUS } from './overlay-colors';
import { SceneOverlay } from './scene-overlay';

export class WorldMarkersOverlay extends SceneOverlay {
  private mesh: THREE.InstancedMesh | null = null;

  /** Show markers at the given world cells (replaces the previous set); null/empty clears. */
  set(positions: [number, number, number][] | null): void {
    this.clear();
    if (!positions?.length) return;
    const geo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    const mat = new THREE.MeshBasicMaterial({
      color: FOCUS,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, positions.length);
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => {
      m.setPosition(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 5; // over the terrain (depthTest is off)
    mesh.userData.noPick = true;
    const group = new THREE.Group();
    group.add(mesh);
    group.userData.noPick = true;
    this.mesh = mesh;
    this.mount(group);
  }

  override clear(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
    super.clear();
  }
}
