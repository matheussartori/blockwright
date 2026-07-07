// The translucent "place structure into world" preview: an open build rendered as a
// ghost over the streamed terrain at the pending anchor/rotation. The placement math
// comes from world/place.ts (`ghostTransform` — the SAME mapping the commit uses), so
// the ghost shows exactly the cells the blocks will land on. Every mesh is `noPick`
// so terrain picking can't hit the ghost while aiming it.
import * as THREE from 'three';
import type { StructureData } from '@/shared/types';
import { SceneOverlay } from './scene-overlay';
import { buildStructure } from './mesh-builder';
import { buildEntities } from './entity-mesh';
import { disposeObject } from './dispose';
import type { TextureLoader } from './texture-loader';
import { ghostTransform, type PlaceTurns, type Vec3 } from '../world/place';

const GHOST_OPACITY = 0.55;

export class WorldGhost extends SceneOverlay {
  private size: Vec3 | null = null;
  /** Guards an out-of-order async build (a superseded `show` resolving late). */
  private buildSeq = 0;

  constructor(scene: THREE.Scene, private textures: TextureLoader) {
    super(scene);
  }

  /** Build (or clear, with null) the ghost meshes. Hidden until the first `place`. */
  async show(data: StructureData | null): Promise<void> {
    const seq = ++this.buildSeq;
    this.clear();
    if (!data) return;
    const textures = await this.textures.load(data.textures);
    if (seq !== this.buildSeq) return; // superseded while textures loaded
    const inner = buildStructure(data, textures);
    inner.add(buildEntities(data.entities, textures));
    inner.traverse((obj) => {
      obj.userData.noPick = true;
      const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const mat of Array.isArray(material) ? material : material ? [material] : []) {
        mat.transparent = true;
        mat.opacity = GHOST_OPACITY;
        mat.depthWrite = false;
      }
    });
    // Outer group carries the anchor; the inner one the rotation + re-normalization.
    const group = new THREE.Group();
    group.add(inner);
    group.visible = false;
    this.size = [...data.size];
    this.mount(group);
  }

  /** Move the ghost so its ROTATED min corner sits at `anchor` (world cell coords). */
  place(anchor: Vec3, turns: PlaceTurns): void {
    if (!this.group || !this.size) return;
    const inner = this.group.children[0];
    const { rotationY, offset } = ghostTransform(this.size, turns);
    inner.rotation.y = rotationY;
    inner.position.set(offset[0], offset[1], offset[2]);
    this.group.position.set(anchor[0], anchor[1], anchor[2]);
    this.group.visible = true;
  }

  override clear(): void {
    if (this.group) disposeObject(this.group);
    this.size = null;
    super.clear();
  }
}
