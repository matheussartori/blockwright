// A live 3D "how big is this?" preview for the Build Planner. It draws the build as a
// translucent W×D×H volume with its wireframe edges, standing on a ground grid, and — the
// whole point — a ~1.8-block player figure beside it so the abstract size numbers become a
// felt scale ("that's a three-storey wall next to a person"). It runs its own lightweight
// Three.js scene (separate from the main Viewer), reads the theme's --accent/--text so it
// matches light/dark, and gently auto-rotates. Purely parametric (box + figure), so it
// rebuilds instantly as the planner's size changes — no asset loading.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

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

/** Distinct per-floor band colours (cycled) — used when the planner is in "per floor"
 *  height mode, so each storey reads as its own coloured slab in the preview. Chosen to
 *  stay legible on both light and dark backgrounds. */
const FLOOR_COLORS = [0x4a8cff, 0x35c4a3, 0xf5a623, 0xb06ef0, 0xff6b81, 0x6ad36a, 0xff8f4a, 0x49c7e8];

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

export function BuildScalePreview({ size, floors }: { size: ScaleSize | null; floors?: number[] | null }) {
  // Stable dependency key for the (otherwise unstable) heights array.
  const floorsKey = floors && floors.length ? floors.join(',') : '';
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);

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

    let raf = 0;
    const timer = new THREE.Timer();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.1);
      if (contentRef.current) contentRef.current.rotation.y += SPIN_RATE * dt;
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

    if (contentRef.current) {
      scene.remove(contentRef.current);
      disposeGroup(contentRef.current);
      contentRef.current = null;
    }
    if (!size) return;

    const accent = cssColor('--accent', 0x4a8cff);
    const text = cssColor('--text', 0xdddddd);
    const skin = new THREE.Color(0xc8a27a);
    const w = Math.max(1, size.w);
    const d = Math.max(1, size.d);
    const h = Math.max(1, size.h);

    const content = new THREE.Group();

    // A faint fill + crisp wireframe slab spanning [y, y+height], base on the ground.
    const addSlab = (y: number, height: number, color: THREE.Color, fillOpacity: number, edgeOpacity: number) => {
      if (height <= 0.001) return;
      const geo = new THREE.BoxGeometry(w, height, d);
      const fill = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false }),
      );
      fill.position.set(0, y + height / 2, 0);
      content.add(fill);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: edgeOpacity }),
      );
      edge.position.set(0, y + height / 2, 0);
      content.add(edge);
    };

    // Per-floor mode: one COLOURED slab per storey, stacked from the ground, with the
    // leftover (roof / overhead) shown as a faint accent cap. Otherwise: one accent box.
    const floorList = floorsKey ? floorsKey.split(',').map(Number) : null;
    if (floorList && floorList.length) {
      let y = 0;
      floorList.forEach((fh, i) => {
        addSlab(y, Math.max(0.001, fh), new THREE.Color(FLOOR_COLORS[i % FLOOR_COLORS.length]), 0.26, 0.85);
        y += fh;
      });
      addSlab(y, h - y, accent, 0.07, 0.4); // the roof / non-storey cap above the top floor
    } else {
      addSlab(0, h, accent, 0.1, 0.85);
    }

    // Player beside the box for scale.
    const player = makePlayer(skin);
    player.position.set(w / 2 + 0.95, 0, d / 2 - 0.4);
    content.add(player);

    // Ground grid spanning the box + the player.
    const span = Math.ceil(Math.max(w, d) + 4);
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
    wrap.rotation.y = START_YAW;
    wrap.add(content);
    scene.add(wrap);
    contentRef.current = wrap;
    frameCamera(cameraRef.current, dims);
  }, [size?.w, size?.d, size?.h, floorsKey]);

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
