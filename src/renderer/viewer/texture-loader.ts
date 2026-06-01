// Loads block textures into GPU textures and caches them across structures.
// Configures pixel-art filtering and detects vertical animation strips.
import * as THREE from 'three';

export interface LoadedTexture {
  texture: THREE.Texture;
  frames: number; // 1 for static, >1 for vertical animation strips
}

export class TextureLoader {
  private loader = new THREE.TextureLoader();
  private cache = new Map<string, LoadedTexture | null>();

  /** Load (or reuse) the given texture keys; missing ones are skipped. */
  async load(keys: string[]): Promise<Map<string, LoadedTexture>> {
    const out = new Map<string, LoadedTexture>();
    await Promise.all(
      keys.map(async (key) => {
        if (this.cache.has(key)) {
          const cached = this.cache.get(key);
          if (cached) out.set(key, cached);
          return;
        }
        try {
          const loaded = await this.loadOne(key);
          this.cache.set(key, loaded);
          out.set(key, loaded);
        } catch {
          this.cache.set(key, null); // missing texture -> fallback color
        }
      }),
    );
    return out;
  }

  private async loadOne(key: string): Promise<LoadedTexture> {
    const texture = await this.loader.loadAsync(window.blockwright.textureUrl(key));
    const img = texture.image as { width: number; height: number };
    const frames =
      img.height > img.width && img.height % img.width === 0 ? img.height / img.width : 1;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, frames };
  }
}
