// The Jigsaw Lab's connector overlay: one gizmo per jigsaw block — an anchor cube at
// the cell plus an arrow cone along the connector's world front, tinted per template
// pool. Two passes like the magic overlay: a depth-tested pass that sits in the scene
// plus a faint x-ray pass so connectors buried inside a piece stay findable. A single
// FOCUS-colored shell follows the marker the panel row under the pointer refers to.
// Like the floor bands / diff marks, the DESIRED markers persist across scene rebuilds
// (showAssembly clears then reapplies), so a settings toggle doesn't drop the gizmos.
import * as THREE from 'three';
import { SceneOverlay } from './scene-overlay';
import { FOCUS } from './overlay-colors';
import type { ConnectorMarker } from './jigsaw-markers';

const UP = new THREE.Vector3(0, 1, 0);
const DIR_VEC: Record<ConnectorMarker['front'], THREE.Vector3> = {
  up: new THREE.Vector3(0, 1, 0),
  down: new THREE.Vector3(0, -1, 0),
  north: new THREE.Vector3(0, 0, -1),
  south: new THREE.Vector3(0, 0, 1),
  east: new THREE.Vector3(1, 0, 0),
  west: new THREE.Vector3(-1, 0, 0),
};

export class JigsawConnectorsOverlay extends SceneOverlay {
  private desired: ConnectorMarker[] | null = null;
  private disposables: { dispose(): void }[] = [];
  /** Marker key → its gizmo group, for focus(). */
  private byKey = new Map<string, THREE.Group>();
  private focusMesh: THREE.Mesh | null = null;
  private focused: string | null = null;
  /** The focus shell's geometry/material live for the overlay's lifetime (the viewer
   *  is created once and never torn down, so this one-off pair never accumulates). */
  private focusGeometry: THREE.BoxGeometry | null = null;
  private focusMaterial: THREE.MeshBasicMaterial | null = null;

  /** Set the markers to show (null/empty = hidden). They persist across rebuilds. */
  set(markers: ConnectorMarker[] | null): void {
    this.desired = markers;
    this.rebuild();
  }

  /** Re-create the gizmos after a scene rebuild dropped them (showAssembly). */
  reapply(): void {
    this.rebuild();
  }

  /** Drop the meshes but KEEP the desired markers (a rebuild will re-show them). */
  clearMeshes(): void {
    this.focusMesh?.parent?.remove(this.focusMesh);
    this.focusMesh = null;
    super.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.byKey.clear();
  }

  override clear(): void {
    this.desired = null;
    this.clearMeshes();
  }

  private rebuild(): void {
    this.clearMeshes();
    const markers = this.desired;
    if (!markers?.length) return;
    const keep = <T extends { dispose(): void }>(d: T): T => {
      this.disposables.push(d);
      return d;
    };
    const anchor = keep(new THREE.BoxGeometry(0.34, 0.34, 0.34));
    const cone = keep(new THREE.ConeGeometry(0.16, 0.42, 12));
    // Shared per-color materials — assemblies can carry hundreds of connectors.
    const materials = new Map<string, THREE.Material>();
    const materialFor = (color: number, xray: boolean): THREE.Material => {
      const id = `${color}:${xray}`;
      let mat = materials.get(id);
      if (!mat) {
        mat = keep(new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: xray ? 0.12 : 0.9,
          depthWrite: false,
          depthTest: !xray,
        }));
        materials.set(id, mat);
      }
      return mat;
    };

    const group = new THREE.Group();
    const q = new THREE.Quaternion();
    for (const m of markers) {
      const g = new THREE.Group();
      g.position.set(m.center[0], m.center[1], m.center[2]);
      q.setFromUnitVectors(UP, DIR_VEC[m.front]);
      for (const xray of [false, true]) {
        const mat = materialFor(m.color, xray);
        const box = new THREE.Mesh(anchor, mat);
        const arrow = new THREE.Mesh(cone, mat);
        arrow.quaternion.copy(q);
        arrow.position.copy(DIR_VEC[m.front]).multiplyScalar(0.6);
        for (const mesh of [box, arrow]) {
          mesh.renderOrder = xray ? 996 : 995;
          mesh.userData.noPick = true; // a gizmo, never a paint/pick target
          g.add(mesh);
        }
      }
      group.add(g);
      this.byKey.set(m.key, g);
    }
    this.mount(group);
    if (this.focused) this.focus(this.focused); // survive a rebuild mid-hover
  }

  /** Wrap the marker for `key` in a FOCUS shell (null = unfocus). */
  focus(key: string | null): void {
    this.focused = key;
    if (this.focusMesh) {
      this.focusMesh.parent?.remove(this.focusMesh);
      this.focusMesh = null;
    }
    if (!key) return;
    const target = this.byKey.get(key);
    if (!target) return;
    if (!this.focusGeometry) {
      this.focusGeometry = new THREE.BoxGeometry(0.62, 0.62, 0.62);
      this.focusMaterial = new THREE.MeshBasicMaterial({
        color: FOCUS,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        depthTest: false,
      });
    }
    this.focusMaterial!.color.setHex(FOCUS); // track a scheme change
    const mesh = new THREE.Mesh(this.focusGeometry, this.focusMaterial!);
    mesh.renderOrder = 997;
    mesh.userData.noPick = true;
    target.add(mesh);
    this.focusMesh = mesh;
  }
}
