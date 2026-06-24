// The block editor's "show voids" overlay: a small wireframe marker (with a faint tinted fill)
// over the EXPLICIT air / structure-void cells that line real geometry — the editable pockets,
// not the whole captured air volume (which would bury the build in fog). Air (clears the cell
// on paste) and structure_void (leaves the world untouched) get distinct hues. depthTest is ON
// so the markers are OCCLUDED by the build like real blocks (a cutaway-style read), instead of
// floating over everything.
import * as THREE from 'three';
import { SceneOverlay } from './scene-overlay';
import { parseCell } from '../editor/cell-key';
import { AIR_MARK, VOID_MARK } from './overlay-colors';

/** One void cell to draw: its "x,y,z" key and which kind of emptiness it is. */
export interface VoidCell {
  key: string;
  kind: 'air' | 'void';
}

export class VoidOverlay extends SceneOverlay {
  // A small inset cube reads as a marker in the pocket, not a full block; reused geometry/
  // materials back every marker (cheap), and outlive any single `set`, so the base `clear()`
  // (which doesn't dispose) is correct.
  private cube = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  private edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.72, 0.72, 0.72));
  private fill = {
    air: new THREE.MeshBasicMaterial({ color: AIR_MARK, transparent: true, opacity: 0.12, depthWrite: false }),
    void: new THREE.MeshBasicMaterial({ color: VOID_MARK, transparent: true, opacity: 0.12, depthWrite: false }),
  };
  private line = {
    air: new THREE.LineBasicMaterial({ color: AIR_MARK, transparent: true, opacity: 0.85 }),
    void: new THREE.LineBasicMaterial({ color: VOID_MARK, transparent: true, opacity: 0.85 }),
  };

  set(cells: VoidCell[]): void {
    this.clear();
    if (!cells.length) return;
    const group = new THREE.Group();
    for (const { key, kind } of cells) {
      const [x, y, z] = parseCell(key);
      const wire = new THREE.LineSegments(this.edges, this.line[kind]);
      wire.position.set(x + 0.5, y + 0.5, z + 0.5);
      group.add(wire);
      const mesh = new THREE.Mesh(this.cube, this.fill[kind]);
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      group.add(mesh);
    }
    this.mount(group);
  }

  /** The mounted markers group, so the viewer can raycast them for the cursor readout. */
  get object(): THREE.Object3D | null {
    return this.group;
  }
}
