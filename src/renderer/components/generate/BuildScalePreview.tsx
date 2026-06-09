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

export function BuildScalePreview({ size }: { size: ScaleSize | null }) {
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

    // The build volume — faint fill + crisp wireframe, base sitting on the ground.
    const boxGeo = new THREE.BoxGeometry(w, h, d);
    const fillMesh = new THREE.Mesh(
      boxGeo,
      new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: 0.1, depthWrite: false }),
    );
    fillMesh.position.set(0, h / 2, 0);
    content.add(fillMesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.85 }),
    );
    edges.position.set(0, h / 2, 0);
    content.add(edges);

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
  }, [size?.w, size?.d, size?.h]);

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
