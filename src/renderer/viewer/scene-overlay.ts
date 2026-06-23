// Shared lifecycle for a group-based viewer overlay (selection box, symmetry plane): owns the
// scene + the currently-mounted group. A subclass builds its group in `set(...)`, calls
// `clear()` to drop the previous one, then `mount(group)` to show the new one. Override
// `clear()` to additionally dispose any per-`set` geometry.
import * as THREE from 'three';

export abstract class SceneOverlay {
  protected group: THREE.Group | null = null;

  constructor(protected scene: THREE.Scene) {}

  /** Show `group` as the current overlay. Call `clear()` first to replace the previous one. */
  protected mount(group: THREE.Group): void {
    this.scene.add(group);
    this.group = group;
  }

  /** Remove the current overlay group (if any). */
  clear(): void {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group = null;
  }
}
