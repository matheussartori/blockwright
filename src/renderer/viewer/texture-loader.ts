// Loads block textures into GPU textures and caches them across structures.
// Configures pixel-art filtering and detects vertical animation strips.
import * as THREE from 'three';

export interface LoadedTexture {
  texture: THREE.Texture;
  frames: number; // 1 for static, >1 for vertical animation strips
  // True when the texture has partially-transparent pixels (stained glass &
  // panes). These render with alpha blending instead of a binary alphaTest cut,
  // so the colored body shows through instead of being discarded.
  translucent: boolean;
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
    const img = texture.image as CanvasImageSource & { width: number; height: number };
    const frames =
      img.height > img.width && img.height % img.width === 0 ? img.height / img.width : 1;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, frames, translucent: detectTranslucency(img) };
  }
}

/** Whether an image carries partial-alpha pixels (not just 0/255 cutout alpha).
 *  Stained glass blocks/panes are uniformly translucent; plain glass is binary. */
function detectTranslucency(img: CanvasImageSource & { width: number; height: number }): boolean {
  const w = img.width;
  const h = img.height;
  if (!w || !h) return false;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  let partial = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a > 12 && a < 243) partial++;
  }
  // Require a meaningful fraction so a few antialiased edge pixels don't flip an
  // otherwise-opaque texture into the (more expensive, sort-sensitive) blend path.
  return partial > w * h * 0.1;
}
