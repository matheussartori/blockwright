// The shared "tear down a THREE subtree" helper: traverse an Object3D and dispose the
// GPU resources its descendants own. Each caller opts into exactly what it OWNS —
// geometries are always disposed, materials only when they aren't shared/cached
// elsewhere (the world view's material cache outlives its chunk groups), and material
// `map` textures only when they were created locally (the floor overlay's canvas
// labels). Duck-typed over Partial<Mesh> so Meshes, LineSegments and Sprites all
// release their buffers through one path.
import type * as THREE from 'three';

export interface DisposeOptions {
  /** Also dispose each object's material(s). Default true; turn OFF when the
   *  materials are shared/cached outside the group (disposing would break siblings). */
  materials?: boolean;
  /** Also dispose each material's `map` texture. Default false; turn ON only for
   *  locally-created textures (e.g. canvas label sprites) — pack textures are cached
   *  in the TextureLoader and must survive the group. */
  textures?: boolean;
}

/** Dispose the geometries (and optionally materials/textures) of `obj`'s subtree. */
export function disposeObject(obj: THREE.Object3D, opts: DisposeOptions = {}): void {
  const { materials = true, textures = false } = opts;
  obj.traverse((o) => {
    const mesh = o as Partial<THREE.Mesh> & { material?: THREE.Material | THREE.Material[] };
    mesh.geometry?.dispose();
    if (!materials || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (textures) (mat as THREE.Material & { map?: THREE.Texture }).map?.dispose();
      mat.dispose();
    }
  });
}
