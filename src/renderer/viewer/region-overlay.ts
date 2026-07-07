// The world editor's box-selection overlay: ONE region box (not per-cell cubes — a
// 64×64×64 selection must stay cheap), drawn as a translucent volume + bright edges +
// corner markers so the selection reads as a filled space, not just an outline. Two fill
// passes: a depth-tested "glass" pass that sits in the scene, and a faint x-ray pass so
// the region stays legible through terrain. While the second corner is being aimed
// (phase 'preview') the edges are dashed; once committed, top/bottom height handles
// (spindle arrows above and below the box) appear for drag-adjusting the Y extent.
import * as THREE from 'three';
import { SceneOverlay } from './scene-overlay';
import { ACCENT, FOCUS } from './overlay-colors';

export type SelectionPhase = 'preview' | 'committed';
export type HeightHandle = 'top' | 'bottom';

/** Geometry epsilon so the box shell doesn't z-fight the block faces it wraps. */
const SKIN = 0.02;

export class WorldSelectionOverlay extends SceneOverlay {
  /** Per-`set` geometries (sized to the region, so they can't be shared) — disposed on clear. */
  private disposables: { dispose(): void }[] = [];
  /** Invisible fat pick targets, keyed by which face they adjust. */
  private handleHits: THREE.Mesh[] = [];
  /** The visible handle meshes, re-tinted on hover. */
  private handleVisuals = new Map<HeightHandle, THREE.Mesh[]>();
  private hovered: HeightHandle | null = null;

  set(region: { min: [number, number, number]; max: [number, number, number] } | null, phase: SelectionPhase): void {
    this.clear();
    if (!region) return;
    const size = new THREE.Vector3(
      region.max[0] - region.min[0] + 1,
      region.max[1] - region.min[1] + 1,
      region.max[2] - region.min[2] + 1,
    );
    const center = new THREE.Vector3(
      region.min[0] + size.x / 2,
      region.min[1] + size.y / 2,
      region.min[2] + size.z / 2,
    );
    const group = new THREE.Group();
    const keep = <T extends { dispose(): void }>(d: T): T => {
      this.disposables.push(d);
      return d;
    };

    const box = keep(new THREE.BoxGeometry(size.x + SKIN, size.y + SKIN, size.z + SKIN));

    // Fill pass 1 — "glass": depth-tested, so nearby terrain still occludes it and the
    // volume reads as sitting IN the world. DoubleSide shows the inner back faces, which
    // is what makes it look filled rather than face-painted.
    const glass = new THREE.Mesh(
      box,
      keep(new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: phase === 'committed' ? 0.18 : 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      })),
    );
    glass.position.copy(center);
    glass.renderOrder = 995;
    group.add(glass);

    // Fill pass 2 — x-ray: a faint always-visible tint so the region never disappears
    // behind a hill while the user orbits/flies around it.
    const xray = new THREE.Mesh(
      box,
      keep(new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        depthTest: false,
      })),
    );
    xray.position.copy(center);
    xray.renderOrder = 996;
    group.add(xray);

    // Edges: dashed while aiming the second corner, solid once committed.
    const edgeGeo = keep(new THREE.EdgesGeometry(box));
    const edgeMat = keep(
      phase === 'preview'
        ? new THREE.LineDashedMaterial({ color: ACCENT, transparent: true, opacity: 0.95, depthTest: false, dashSize: 0.45, gapSize: 0.3 })
        : new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95, depthTest: false }),
    );
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    if (phase === 'preview') edges.computeLineDistances();
    edges.position.copy(center);
    edges.renderOrder = 998;
    group.add(edges);

    // Corner markers anchor the box visually (and echo the two-click corner mental model).
    const cornerGeo = keep(new THREE.BoxGeometry(0.28, 0.28, 0.28));
    const cornerMat = keep(new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false }));
    for (const x of [region.min[0], region.max[0] + 1]) {
      for (const y of [region.min[1], region.max[1] + 1]) {
        for (const z of [region.min[2], region.max[2] + 1]) {
          const c = new THREE.Mesh(cornerGeo, cornerMat);
          c.position.set(x, y, z);
          c.renderOrder = 999;
          group.add(c);
        }
      }
    }

    if (phase === 'committed') this.buildHandles(group, region, size, center, keep);
    this.mount(group);
    this.setHandleHover(this.hovered); // keep the tint across a re-set mid-drag
  }

  /** Tint the hovered/dragged handle (amber) and remember it across re-`set`s. */
  setHandleHover(face: HeightHandle | null): void {
    this.hovered = face;
    for (const [f, meshes] of this.handleVisuals) {
      for (const m of meshes) (m.material as THREE.MeshBasicMaterial).color.setHex(f === face ? FOCUS : ACCENT);
    }
  }

  /** Which height handle (if any) the given ray hits — the fat invisible pick targets. */
  pickHandle(raycaster: THREE.Raycaster): HeightHandle | null {
    if (!this.handleHits.length) return null;
    const hit = raycaster.intersectObjects(this.handleHits, false)[0];
    return hit ? (hit.object.userData.face as HeightHandle) : null;
  }

  override clear(): void {
    super.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.handleHits = [];
    this.handleVisuals.clear();
  }

  /** The top/bottom spindle handles: two cones tip-out (an ns-resize glyph in 3D), floated
   *  just off the face, plus an invisible oversized sphere each so grabbing is forgiving. */
  private buildHandles(
    group: THREE.Group,
    region: { min: [number, number, number]; max: [number, number, number] },
    size: THREE.Vector3,
    center: THREE.Vector3,
    keep: <T extends { dispose(): void }>(d: T) => T,
  ): void {
    const s = THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.06, 0.35, 1.1);
    const cone = keep(new THREE.ConeGeometry(s * 0.55, s, 4));
    const stem = keep(new THREE.BoxGeometry(s * 0.16, s * 0.7, s * 0.16));
    const hitGeo = keep(new THREE.SphereGeometry(s * 1.6));
    const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false }));

    for (const face of ['top', 'bottom'] as const) {
      const dir = face === 'top' ? 1 : -1;
      const faceY = face === 'top' ? region.max[1] + 1 : region.min[1];
      const baseY = faceY + dir * (0.35 + s * 0.35);
      const mat = keep(new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false }));
      const visuals: THREE.Mesh[] = [];

      const arrow = new THREE.Mesh(cone, mat);
      arrow.position.set(center.x, baseY + dir * (s * 0.85), center.z);
      if (face === 'bottom') arrow.rotation.x = Math.PI;
      arrow.renderOrder = 999;
      visuals.push(arrow);

      const bar = new THREE.Mesh(stem, mat);
      bar.position.set(center.x, baseY, center.z);
      bar.renderOrder = 999;
      visuals.push(bar);

      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.set(center.x, baseY + dir * (s * 0.4), center.z);
      hit.userData.face = face;
      group.add(arrow, bar, hit);

      this.handleVisuals.set(face, visuals);
      this.handleHits.push(hit);
    }
  }
}
