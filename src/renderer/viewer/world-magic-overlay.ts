// The world editor's MAGIC-SELECT overlay: the selected contiguous cells drawn as ONE
// InstancedMesh of translucent unit boxes (a magic region is an arbitrary blob — the
// single-box region overlay can't show it, and per-cell meshes would melt at the 4096
// cap). Two passes like the region overlay: a depth-tested glass pass that sits in the
// world plus a faint x-ray pass so the blob stays legible through terrain.
import * as THREE from 'three';
import { SceneOverlay } from './scene-overlay';
import { FOCUS } from './overlay-colors';

/** Slight inflation so the boxes don't z-fight the block faces they wrap. */
const SKIN = 0.02;

export class WorldMagicOverlay extends SceneOverlay {
  private disposables: { dispose(): void }[] = [];

  set(cells: [number, number, number][] | null): void {
    this.clear();
    if (!cells?.length) return;
    const group = new THREE.Group();
    const keep = <T extends { dispose(): void }>(d: T): T => {
      this.disposables.push(d);
      return d;
    };
    const box = keep(new THREE.BoxGeometry(1 + SKIN, 1 + SKIN, 1 + SKIN));
    const passes: { opacity: number; depthTest: boolean; renderOrder: number }[] = [
      { opacity: 0.3, depthTest: true, renderOrder: 995 },
      { opacity: 0.07, depthTest: false, renderOrder: 996 },
    ];
    const m = new THREE.Matrix4();
    for (const pass of passes) {
      const mat = keep(new THREE.MeshBasicMaterial({
        color: FOCUS,
        transparent: true,
        opacity: pass.opacity,
        depthWrite: false,
        depthTest: pass.depthTest,
        side: THREE.DoubleSide,
      }));
      const mesh = new THREE.InstancedMesh(box, mat, cells.length);
      cells.forEach((c, i) => mesh.setMatrixAt(i, m.makeTranslation(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.renderOrder = pass.renderOrder;
      mesh.userData.noPick = true; // an overlay, never a paint/pick target
      group.add(mesh);
      keep(mesh); // InstancedMesh owns an instance buffer of its own
    }
    this.mount(group);
  }

  override clear(): void {
    super.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
