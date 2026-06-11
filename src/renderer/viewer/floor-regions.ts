// The floor-plan overlay: one translucent, labelled band per named vertical level,
// spanning the build's footprint over the level's inclusive y range. The bands
// persist across orbit and across builds — the App drives the desired regions from
// the active doc's floor plan; the Viewer re-applies them after each load (which
// clears the scene). State (`regions`) is kept here so the bands survive a build;
// `group` holds the live meshes.
import * as THREE from 'three';

/** A named vertical band highlighted in the viewer (one per floor-plan level),
 *  spanning the inclusive y range `from`..`to`. */
export interface FloorRegion {
  name: string;
  from: number;
  to: number;
}

/** A small canvas-textured sprite used to caption a level band. */
function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const pad = 12;
  const font = 'bold 40px -apple-system, sans-serif';
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = 56 + pad;
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = 'rgba(20,24,32,0.62)';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 12);
  ctx.fill();
  ctx.fillStyle = '#dce6ff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Quieter caption: the whole sprite (chip + text) rides at a reduced opacity so the
  // bands inform without dominating the build.
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }),
  );
  // Scale to world units, preserving the canvas aspect — ~30% smaller than before so
  // the labels read as secondary annotations, not headlines.
  sprite.scale.set((w / h) * 0.78, 0.78, 1);
  return sprite;
}

export class FloorRegionsOverlay {
  /** The desired bands (kept across builds); `group` is the live mesh set. */
  private regions: FloorRegion[] = [];
  private group: THREE.Group | null = null;

  constructor(private scene: THREE.Scene) {}

  /** Set (or clear) the desired bands and render them against `current`'s footprint. */
  setRegions(regions: FloorRegion[], current: THREE.Group | null): void {
    this.regions = regions;
    this.render(current);
  }

  /** Re-render the kept bands against `current` (call after each build, since the
   *  scene clear drops the meshes but the desired regions persist). */
  reapply(current: THREE.Group | null): void {
    this.render(current);
  }

  /** Drop the live band meshes but keep `regions`, so the next build re-renders the
   *  same plan. Called when the viewer clears a structure. */
  clearMeshes(): void {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const obj = o as Partial<THREE.Mesh> & { material?: THREE.Material | THREE.Material[] };
      obj.geometry?.dispose();
      const mat = obj.material as (THREE.Material & { map?: THREE.Texture }) | undefined;
      if (mat) {
        mat.map?.dispose();
        mat.dispose();
      }
    });
    this.group = null;
  }

  /** (Re)build the band meshes from `regions` against the current footprint. */
  private render(current: THREE.Group | null): void {
    this.clearMeshes();
    if (this.regions.length === 0) return;

    // Footprint from the current build, padded out a little; fall back to a
    // comfortable pad centred on the origin for a fresh (empty) tab.
    let minX = -1;
    let maxX = 15;
    let minZ = -1;
    let maxZ = 15;
    if (current) {
      const box = new THREE.Box3().setFromObject(current);
      minX = box.min.x - 1;
      maxX = box.max.x + 1;
      minZ = box.min.z - 1;
      maxZ = box.max.z + 1;
    }
    const w = Math.max(maxX - minX, 2);
    const d = Math.max(maxZ - minZ, 2);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const group = new THREE.Group();
    this.regions.forEach((r, i) => {
      const from = Math.min(r.from, r.to);
      const to = Math.max(r.from, r.to);
      // Layer `to` occupies y=to..to+1, so the band's top is at to+1.
      const h = to + 1 - from;
      const cy = from + h / 2;
      // A distinct hue per level so stacked bands read apart.
      const color = new THREE.Color().setHSL((i * 0.13 + 0.58) % 1, 0.6, 0.6);

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.06,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      box.position.set(cx, cy, cz);
      group.add(box);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(box.geometry),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }),
      );
      edges.position.copy(box.position);
      group.add(edges);

      const text = r.name.trim()
        ? `${r.name.trim()} · y ${from}${to > from ? `–${to}` : ''}`
        : `y ${from}${to > from ? `–${to}` : ''}`;
      const sprite = makeLabel(text);
      sprite.position.set(cx, to + 1 + 0.6, cz);
      group.add(sprite);
    });

    group.renderOrder = 998;
    this.scene.add(group);
    this.group = group;
  }
}
