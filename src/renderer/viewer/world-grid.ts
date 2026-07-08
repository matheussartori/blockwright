// The world viewer's chunk-grid overlay (the F3+G essential): vertical lines at every
// chunk corner around the camera, full build height, with REGION corners (every 32
// chunks) drawn brighter. Follows the camera — the line set rebuilds only when the
// camera crosses into another chunk.
import * as THREE from 'three';
import { ACCENT, FOCUS } from './overlay-colors';
import { SceneOverlay } from './scene-overlay';

/** Chunk corners drawn each side of the camera chunk. */
const RADIUS = 4;

export class WorldGridOverlay extends SceneOverlay {
  private enabled = false;
  private lastKey = '';
  private lines: THREE.LineSegments[] = [];

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.clear();
      this.lastKey = '';
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Per-frame follow: rebuild the line set when the camera enters another chunk. */
  follow(camPos: [number, number, number], yRange: [number, number]): void {
    if (!this.enabled) return;
    const ccx = Math.floor(camPos[0] / 16);
    const ccz = Math.floor(camPos[2] / 16);
    const key = `${ccx},${ccz},${yRange[0]},${yRange[1]}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.clear();

    const chunk: number[] = [];
    const region: number[] = [];
    for (let dx = -RADIUS; dx <= RADIUS + 1; dx++) {
      for (let dz = -RADIUS; dz <= RADIUS + 1; dz++) {
        const x = (ccx + dx) * 16;
        const z = (ccz + dz) * 16;
        const target = (ccx + dx) % 32 === 0 && (ccz + dz) % 32 === 0 ? region : chunk;
        target.push(x, yRange[0], z, x, yRange[1], z);
      }
    }
    const group = new THREE.Group();
    group.userData.noPick = true;
    this.lines = [
      makeLines(chunk, ACCENT, 0.3),
      makeLines(region, FOCUS, 0.6),
    ];
    for (const l of this.lines) group.add(l);
    this.mount(group);
  }

  override clear(): void {
    for (const l of this.lines) {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
    this.lines = [];
    super.clear();
  }
}

function makeLines(positions: number[], color: number, opacity: number): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.userData.noPick = true;
  return lines;
}
