// The two-point measure tool's scene marks: an endpoint cube at each picked cell and a
// line between them (drawn through geometry — depthTest off — so a span across a build
// stays visible). Accent-coloured like the selection overlays.
import * as THREE from 'three';
import { ACCENT, FOCUS } from './overlay-colors';
import { SceneOverlay } from './scene-overlay';

export class MeasureOverlay extends SceneOverlay {
  private disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  /** Show the measure marks: point A (always), point B + the connecting line (when set). */
  set(a: [number, number, number] | null, b: [number, number, number] | null): void {
    this.clear();
    if (!a) return;
    const group = new THREE.Group();
    group.userData.noPick = true;
    group.add(this.endpoint(a, FOCUS));
    if (b) {
      group.add(this.endpoint(b, FOCUS));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [a[0] + 0.5, a[1] + 0.5, a[2] + 0.5, b[0] + 0.5, b[1] + 0.5, b[2] + 0.5],
          3,
        ),
      );
      const mat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9, depthTest: false });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 6;
      this.disposables.push(geo, mat);
      group.add(line);
    }
    this.mount(group);
  }

  private endpoint(p: [number, number, number], color: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
    mesh.renderOrder = 6;
    mesh.userData.noPick = true;
    this.disposables.push(geo, mat);
    return mesh;
  }

  override clear(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    super.clear();
  }
}
