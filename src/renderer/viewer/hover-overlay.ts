// The block editor's hover preview: a single translucent cube + wire edge at the cell the
// next click would affect, tinted by intent (add / recolor / remove). It answers the most
// common voxel-editor complaint — "I can't tell where the block lands until it's placed" —
// by previewing the target before you commit. `set(cell, color)` moves it; `set(null)` hides.
import * as THREE from 'three';
import { SceneOverlay } from './scene-overlay';
import type { Cell } from '../editor/cell-key';

export class HoverOverlay extends SceneOverlay {
  private cube = new THREE.BoxGeometry(1, 1, 1);
  private edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
  private fillMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthTest: false });
  private lineMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9, depthTest: false });

  /** Show the preview at `cell` in `color` (sRGB hex), or hide it when `cell` is null. */
  set(cell: Cell | null, color = 0xffffff): void {
    this.clear();
    if (!cell) return;
    this.fillMat.color.setHex(color);
    this.lineMat.color.setHex(color);
    const group = new THREE.Group();
    const fill = new THREE.Mesh(this.cube, this.fillMat);
    fill.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);
    fill.renderOrder = 994;
    group.add(fill);
    const wire = new THREE.LineSegments(this.edges, this.lineMat);
    wire.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);
    wire.renderOrder = 995;
    group.add(wire);
    this.mount(group);
  }
}
