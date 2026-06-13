// A live 3D "how big is this?" preview for the Build Planner. It draws the build as a
// translucent W×D×H volume with its wireframe edges, standing on a ground grid, and — the
// whole point — a ~1.8-block player figure beside it so the abstract size numbers become a
// felt scale ("that's a three-storey wall next to a person"). A selected BASEMENT/ATTIC
// shows as its own coloured band (instead of vanishing into the faint overhead cap), and in
// per-floor height mode each storey is its own coloured slab the user can DRAG vertically
// to resize (wired back to the planner's per-floor heights). It runs its own lightweight
// Three.js scene (separate from the main Viewer), reads the theme's --accent/--text so it
// matches light/dark, and gently auto-rotates (paused while dragging).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MAX_STOREY_H, MIN_FLOOR_H } from '@/shared/domain/storeys';

/** A Minecraft player is 1.8 blocks tall — the reference the figure is built to. */
export const PLAYER_H = 1.8;
const SPIN_RATE = 0.4;
const START_YAW = -Math.PI / 5;
const FOV = 35;

export interface ScaleSize {
  w: number;
  d: number;
  h: number;
}

/** The non-storey vertical segments (cells): a selected basement at the bottom (its total
 *  depth, plus the per-level breakdown), the attic headroom + roof reserve at the top.
 *  Zeros/[] for unpicked slots. */
export interface ScaleOverheads {
  basement: number;
  /** Per-level basement depths (top-down: index 0 is just under the ground floor) — one
   *  draggable band is drawn per entry. Empty when no basement is picked. */
  basementLevels: number[];
  attic: number;
  roof: number;
}

/** Distinct per-floor band colours (cycled) — used when the planner is in "per floor"
 *  height mode, so each storey reads as its own coloured slab in the preview. Chosen to
 *  stay legible on both light and dark backgrounds. */
const FLOOR_COLORS = [0x4a8cff, 0x35c4a3, 0xf5a623, 0xb06ef0, 0xff6b81, 0x6ad36a, 0xff8f4a, 0x49c7e8];

/** Highlight colours for the basement/attic bands — exported so the planner's legend
 *  chips show the same swatches the 3D bands use. */
export const BASEMENT_COLOR = '#8d6e63';
export const ATTIC_COLOR = '#d9b54a';
/** The surroundings ring's ground-level swatch (a lawn green). */
export const SURROUND_COLOR = '#4f9e5a';

/** The surroundings RING margins (cells per side) around the building shell — `side` on
 *  the X axis (both sides), `front`/`back` on the Z axis (the front is the -z entry face). */
export interface ScaleSurround {
  side: number;
  front: number;
  back: number;
}

/** How many cells tall the ground-level yard plate reads in the preview (landscaping). */
const SURROUND_PLATE_H = 1;

/** A draggable band: an above-ground storey (by index), the attic band, or a basement
 *  LEVEL (top-down index, e.g. `basement:0` is the level just under the ground floor). */
export type BandId = number | 'attic' | `basement:${number}`;

/** Distinct shades for the stacked basement levels (cycled), keyed off {@link BASEMENT_COLOR}
 *  so the undercroft reads as one family that gets darker as it goes deeper. */
const BASEMENT_SHADES = ['#9c7b6c', '#8d6e63', '#7a5e54', '#674f47'];

/** An in-flight band drag (per-floor mode): which band, where it started. */
interface BandDrag {
  band: BandId;
  startH: number;
  startClientY: number;
}

/** Read a CSS custom property off :root as a THREE color (so the preview tracks theme). */
function cssColor(name: string, fallback: number): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return new THREE.Color(fallback);
  try {
    return new THREE.Color(raw);
  } catch {
    return new THREE.Color(fallback);
  }
}

/** A simple blocky humanoid ~1.8 blocks tall, for scale reference. */
function makePlayer(skin: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const shirt = new THREE.Color(0x2f8f83);
  const pants = new THREE.Color(0x37415a);
  const add = (w: number, h: number, depth: number, x: number, y: number, color: THREE.Color) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
    );
    m.position.set(x, y, 0);
    g.add(m);
  };
  add(0.22, 0.74, 0.28, -0.12, 0.37, pants); // legs
  add(0.22, 0.74, 0.28, 0.12, 0.37, pants);
  add(0.5, 0.64, 0.28, 0, 1.06, shirt); // torso
  add(0.16, 0.6, 0.26, -0.33, 1.08, shirt); // arms
  add(0.16, 0.6, 0.26, 0.33, 1.08, shirt);
  add(0.42, 0.42, 0.42, 0, 1.59, skin); // head (~1.8 total)
  return g;
}

export function BuildScalePreview({
  size,
  floors,
  overheads,
  surround,
  basementSize,
  onBandHeight,
}: {
  size: ScaleSize | null;
  floors?: number[] | null;
  /** Basement/attic/roof band heights — a picked basement/attic gets its own colour, and a
   *  multi-level basement is drawn as one band per level (top-down). */
  overheads?: ScaleOverheads | null;
  /** The picked surroundings ring's per-side margins, drawn as a ground-level yard plate
   *  around the house footprint. Null when no surroundings module is selected. */
  surround?: ScaleSurround | null;
  /** The basement FOOTPRINT (cells) when the user enlarged it past the house — the below-grade
   *  bands are drawn this wide so a bigger undercroft reads at scale. Null = match the house. */
  basementSize?: { w: number; d: number } | null;
  /** When given (per-floor mode), every band becomes draggable: drag up/down to resize
   *  that storey (by index), the attic band, or a basement level (`basement:i`). */
  onBandHeight?: (band: BandId, value: number) => void;
}) {
  // Stable dependency keys for the (otherwise unstable) heights/overheads.
  const floorsKey = floors && floors.length ? floors.join(',') : '';
  const basementKey = overheads?.basementLevels?.length ? overheads.basementLevels.join(',') : '';
  const basementH = overheads?.basement ?? 0;
  const basementW = basementSize?.w ?? 0;
  const basementD = basementSize?.d ?? 0;
  const atticH = overheads?.attic ?? 0;
  const roofH = overheads?.roof ?? 0;
  const surroundSide = surround?.side ?? 0;
  const surroundFront = surround?.front ?? 0;
  const surroundBack = surround?.back ?? 0;
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  // Interaction state, read by the (once-mounted) pointer handlers via refs so the
  // handlers never go stale across rebuilds.
  const bandMeshesRef = useRef<THREE.Mesh[]>([]);
  const dragRef = useRef<BandDrag | null>(null);
  const hoverRef = useRef<THREE.Mesh | null>(null);
  const floorsRef = useRef<number[] | null>(null);
  const overheadsRef = useRef<ScaleOverheads | null>(null);
  const onBandHeightRef = useRef<typeof onBandHeight>(undefined);
  floorsRef.current = floors ?? null;
  overheadsRef.current = overheads ?? null;
  onBandHeightRef.current = onBandHeight;

  // Renderer/scene/loop once.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2000);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(0.6, 1, 0.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-0.5, 0.3, -0.6);
    scene.add(fill);

    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // --- Band drag (per-floor mode): pick a coloured slab (storey/basement/attic), drag
    // up/down to resize it. Pixel→cell conversion uses the camera's visible height at its
    // orbit distance, so a drag tracks the cursor regardless of zoom-to-fit.
    const raycaster = new THREE.Raycaster();
    const pickBand = (e: PointerEvent): THREE.Mesh | null => {
      if (!bandMeshesRef.current.length) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(bandMeshesRef.current, false)[0];
      return (hit?.object as THREE.Mesh) ?? null;
    };
    const bandHeight = (band: BandId): number | undefined => {
      if (typeof band === 'number') return floorsRef.current?.[band];
      if (band === 'attic') return overheadsRef.current?.attic;
      const level = Number(band.slice('basement:'.length));
      return overheadsRef.current?.basementLevels?.[level];
    };
    const setHover = (mesh: THREE.Mesh | null) => {
      if (hoverRef.current === mesh) return;
      const restore = hoverRef.current;
      if (restore && (restore.material as THREE.MeshStandardMaterial).opacity !== undefined) {
        (restore.material as THREE.MeshStandardMaterial).opacity = restore.userData.baseOpacity as number;
      }
      hoverRef.current = mesh;
      if (mesh) (mesh.material as THREE.MeshStandardMaterial).opacity = 0.45;
      renderer.domElement.style.cursor = mesh ? 'ns-resize' : '';
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!onBandHeightRef.current) return;
      const mesh = pickBand(e);
      if (!mesh) return;
      const band = mesh.userData.band as BandId;
      const startH = bandHeight(band);
      if (startH === undefined) return;
      dragRef.current = { band, startH, startClientY: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        setHover(onBandHeightRef.current ? pickBand(e) : null);
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      const dist = camera.position.length(); // camera orbits the origin
      const worldPerPx = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, rect.height);
      const delta = (drag.startClientY - e.clientY) * worldPerPx; // up = taller
      const next = Math.max(MIN_FLOOR_H, Math.min(MAX_STOREY_H, Math.round(drag.startH + delta)));
      if (next !== bandHeight(drag.band)) onBandHeightRef.current?.(drag.band, next);
    };
    const endDrag = (e: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', endDrag);
    renderer.domElement.addEventListener('pointercancel', endDrag);
    renderer.domElement.addEventListener('pointerleave', () => setHover(null));

    let raf = 0;
    const timer = new THREE.Timer();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.1);
      // Hold the model still while a floor band is being dragged.
      if (contentRef.current && !dragRef.current) contentRef.current.rotation.y += SPIN_RATE * dt;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // Rebuild the box + player + grid whenever the size changes.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const prevYaw = contentRef.current?.rotation.y;
    if (contentRef.current) {
      scene.remove(contentRef.current);
      disposeGroup(contentRef.current);
      contentRef.current = null;
    }
    bandMeshesRef.current = [];
    hoverRef.current = null;
    if (!size) return;

    const accent = cssColor('--accent', 0x4a8cff);
    const text = cssColor('--text', 0xdddddd);
    const skin = new THREE.Color(0xc8a27a);
    const w = Math.max(1, size.w);
    const d = Math.max(1, size.d);
    const h = Math.max(1, size.h);

    const content = new THREE.Group();

    // A faint fill + crisp wireframe slab spanning [y, y+height], base on the ground.
    // Returns the fill mesh so the per-floor bands can be registered for drag picking. The
    // footprint defaults to the build's W×D, overridable (a wider basement undercroft).
    const addSlab = (
      y: number,
      height: number,
      color: THREE.Color,
      fillOpacity: number,
      edgeOpacity: number,
      footW = w,
      footD = d,
    ): THREE.Mesh | null => {
      if (height <= 0.001) return null;
      const geo = new THREE.BoxGeometry(footW, height, footD);
      const fill = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false }),
      );
      fill.position.set(0, y + height / 2, 0);
      fill.userData.baseOpacity = fillOpacity;
      content.add(fill);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: edgeOpacity }),
      );
      edge.position.set(0, y + height / 2, 0);
      content.add(edge);
      return fill;
    };

    // The GROUND floor sits at y=0. Above-ground storeys stack UP from there — one
    // COLOURED, draggable slab per floor in per-floor mode, else one accent volume —
    // capped by the TOP band (a picked ATTIC is the topmost level and engulfs the whole
    // roof zone; `overheads.roof` is 0 then — otherwise the roof reserve caps it as a
    // faint accent). A picked BASEMENT drops BELOW the ground plane (negative y), so the
    // preview reads the way the house does in-world. With nothing picked and a single
    // total height, the box stays one plain accent volume rising from the ground.
    const registerBand = (mesh: THREE.Mesh | null, band: BandId) => {
      if (!mesh) return;
      mesh.userData.band = band;
      bandMeshesRef.current.push(mesh);
    };
    const floorList = floorsKey ? floorsKey.split(',').map(Number) : null;
    const basementList = basementKey ? basementKey.split(',').map(Number) : null;
    const segmented = basementH > 0 || atticH > 0 || !!floorList?.length;
    if (segmented) {
      // The basement hangs below the ground plane, stacked downward: level 0 (top-down) sits
      // just under y=0, deeper levels below it. Each level is its own draggable band, drawn at
      // the basement footprint (wider than the house when the user enlarged it).
      if (basementList && basementList.length) {
        const bw = Math.max(w, basementW);
        const bd = Math.max(d, basementD);
        let by = 0;
        basementList.forEach((lh, i) => {
          by -= lh;
          const shade = new THREE.Color(BASEMENT_SHADES[Math.min(i, BASEMENT_SHADES.length - 1)]);
          registerBand(addSlab(by, lh, shade, 0.28, 0.9, bw, bd), `basement:${i}`);
        });
      } else if (basementH > 0) {
        registerBand(addSlab(-basementH, basementH, new THREE.Color(BASEMENT_COLOR), 0.28, 0.9), 'basement:0');
      }
      const top = h - basementH; // the above-ground extent (the basement lives below y=0)
      let y = 0;
      if (floorList && floorList.length) {
        floorList.forEach((fh, i) => {
          const mesh = addSlab(y, Math.max(0.001, fh), new THREE.Color(FLOOR_COLORS[i % FLOOR_COLORS.length]), 0.26, 0.85);
          registerBand(mesh, i);
          y += fh;
        });
      } else {
        const storeys = top - atticH - roofH;
        addSlab(0, storeys, accent, 0.1, 0.85);
        y = Math.max(0, storeys);
      }
      if (atticH > 0) {
        // The attic band runs to the very top of the above-ground box — it owns the roof zone.
        registerBand(addSlab(y, Math.max(0, top - y), new THREE.Color(ATTIC_COLOR), 0.28, 0.9), 'attic');
      } else {
        addSlab(y, top - y, accent, 0.07, 0.4); // no attic → the roof reserve caps the box
      }
    } else {
      addSlab(0, h, accent, 0.1, 0.85);
    }

    // The surroundings ring: a translucent ground-level yard plate around the house
    // footprint, extending by the picked margins (side on x, front/back on z — the house
    // is centred at the origin, the front being the -z entry face). Drawn at y∈[0, plate]
    // so it reads at ground level, never as a floor of the house.
    if (surroundSide > 0 || surroundFront > 0 || surroundBack > 0) {
      const ow = w + surroundSide * 2;
      const od = d + surroundFront + surroundBack;
      const zc = (surroundBack - surroundFront) / 2; // shift so front/back margins land right
      const lawn = new THREE.Color(SURROUND_COLOR);
      const geo = new THREE.BoxGeometry(ow, SURROUND_PLATE_H, od);
      const plate = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: lawn, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      plate.position.set(0, SURROUND_PLATE_H / 2, zc);
      content.add(plate);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: lawn, transparent: true, opacity: 0.55 }),
      );
      edge.position.copy(plate.position);
      content.add(edge);
    }

    // Player beside the box for scale.
    const player = makePlayer(skin);
    player.position.set(w / 2 + surroundSide + 0.95, 0, d / 2 - 0.4);
    content.add(player);

    // Ground grid spanning the box (incl. the yard ring + a wider basement) + the player.
    const span = Math.ceil(
      Math.max(w + surroundSide * 2, d + surroundFront + surroundBack, basementW, basementD) + 4,
    );
    const grid = new THREE.GridHelper(span, span, text, text);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.14;
    content.add(grid);

    // Centre everything for stable framing, then wrap so it auto-rotates as a unit.
    const bbox = new THREE.Box3().setFromObject(content);
    const center = bbox.getCenter(new THREE.Vector3());
    const dims = bbox.getSize(new THREE.Vector3());
    content.position.sub(center);
    const wrap = new THREE.Group();
    // Keep the current spin so a mid-drag rebuild doesn't snap the model back.
    wrap.rotation.y = prevYaw ?? START_YAW;
    wrap.add(content);
    scene.add(wrap);
    contentRef.current = wrap;
    frameCamera(cameraRef.current, dims);
  }, [size?.w, size?.d, size?.h, floorsKey, basementKey, basementH, basementW, basementD, atticH, roofH, surroundSide, surroundFront, surroundBack]);

  return <div className="scale-preview-canvas" ref={mountRef} />;
}



/** Pull the camera to a 3/4 view that fits the bounding box, with margin. */
function frameCamera(camera: THREE.PerspectiveCamera | null, size: THREE.Vector3): void {
  if (!camera) return;
  const radius = Math.max(size.x, size.y, size.z, 1) * 0.5;
  const fitH = radius / Math.tan((camera.fov * Math.PI) / 360);
  const fitW = fitH / camera.aspect;
  const dist = Math.max(fitH, fitW) * 1.35 + radius;
  const dir = new THREE.Vector3(1, 0.6, 1).normalize();
  camera.position.copy(dir.multiplyScalar(dist));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
