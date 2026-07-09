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
  /** True when the texture has fully-transparent holes (leaves, glass, spawner). Such a block can
   *  never be a face-culling occluder — the world behind shows through the holes. */
  cutout: boolean;
  /** Average (alpha-weighted) sRGB colour of the first frame, 0..1 — drives the far-LOD surface
   *  colour + the minimap, so distant terrain reads with real block colours (grass green, sand tan)
   *  instead of a deterministic hash. */
  avgColor: [number, number, number];
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
    const { translucent, cutout, avgColor } = analyzeImage(img, frames);
    return { texture, frames, translucent, cutout, avgColor };
  }
}

/** Analyse a texture image in one canvas pass: partial-alpha detection (stained glass vs binary
 *  cutout), fully-transparent-hole detection (leaves/glass — never occluders) + the alpha-weighted
 *  average colour of its FIRST animation frame (for far-LOD / minimap).
 *  Colours are read in the texture's storage space (sRGB) and returned 0..1. */
function analyzeImage(
  img: CanvasImageSource & { width: number; height: number },
  frames: number,
): { translucent: boolean; cutout: boolean; avgColor: [number, number, number] } {
  const w = img.width;
  const h = img.height;
  if (!w || !h) return { translucent: false, cutout: false, avgColor: [0.5, 0.5, 0.5] };
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { translucent: false, cutout: false, avgColor: [0.5, 0.5, 0.5] };
  ctx.drawImage(img, 0, 0);
  const frameH = Math.max(1, Math.floor(h / Math.max(1, frames))); // first frame only
  const { data } = ctx.getImageData(0, 0, w, frameH);
  let partial = 0;
  let holes = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let wsum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a > 12 && a < 243) partial++;
    else if (a <= 12) holes++;
    if (a > 8) {
      const aw = a / 255;
      r += data[i] * aw;
      g += data[i + 1] * aw;
      b += data[i + 2] * aw;
      wsum += aw;
    }
  }
  const avg: [number, number, number] = wsum
    ? [r / wsum / 255, g / wsum / 255, b / wsum / 255]
    : [0.5, 0.5, 0.5];
  // Require a meaningful fraction so a few antialiased edge pixels don't flip an otherwise-opaque
  // texture into the (more expensive, sort-sensitive) blend path (`partial` is counted over the
  // first frame but thresholded against the whole strip — historical, kept stable) or out of the
  // occluder set (`holes` thresholds against the sampled frame).
  return { translucent: partial > w * h * 0.1, cutout: holes > (data.length / 4) * 0.01, avgColor: avg };
}
