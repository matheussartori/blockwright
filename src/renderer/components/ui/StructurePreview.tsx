// A small, self-contained 3D preview of a whole structure (or a single block). It
// runs its own lightweight Three.js scene (separate from the main Viewer) and reuses
// the normal mesh pipeline: given StructureData, `buildStructure` + `TextureLoader`
// turn it into the same meshes the viewer would draw. The build is centred and the
// camera distance auto-fits its bounding box, then it gently auto-rotates (delta-timed,
// so the pace is the same regardless of display refresh rate). BlockPreview is a thin
// wrapper over this for the Block Catalog.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { StructureData } from '@/shared/types';
import { buildStructure } from '../../viewer/mesh-builder';
import { TextureLoader } from '../../viewer/texture-loader';

/** Auto-rotation speed in radians/second — calm, not spinning. */
const SPIN_RATE = 0.5;
/** Starting yaw so a build opens on a pleasing 3/4 view, not flat-on. */
const START_YAW = -Math.PI / 5;
/** Camera vertical field of view (deg). */
const FOV = 35;

export function StructurePreview({ data }: { data: StructureData | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const texturesRef = useRef<TextureLoader>(new TextureLoader());

  // Create the renderer/scene once and drive the animation loop.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // transparent → the panel background shows
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);

    scene.add(new THREE.AmbientLight(0xffffff, 0.78));
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
    const timer = new THREE.Timer(); // THREE.Clock is deprecated; Timer is the replacement
    const animate = () => {
      raf = requestAnimationFrame(animate);
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.1); // clamp to avoid a jump after a stall
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

  // (Re)build the previewed structure whenever the data changes.
  useEffect(() => {
    let alive = true;
    const scene = sceneRef.current;
    if (!scene) return;

    // Drop the previous build.
    if (contentRef.current) {
      scene.remove(contentRef.current);
      disposeGroup(contentRef.current);
      contentRef.current = null;
    }
    if (!data) return;

    void (async () => {
      try {
        const textures = await texturesRef.current.load(data.textures);
        if (!alive) return;
        const group = buildStructure(data, textures);
        // Centre the build at the origin so the camera framing is stable.
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        group.position.sub(center);
        const wrap = new THREE.Group();
        wrap.rotation.y = START_YAW;
        wrap.add(group);
        scene.add(wrap);
        contentRef.current = wrap;
        frameCamera(cameraRef.current, size);
      } catch {
        /* leave the preview empty on failure */
      }
    })();

    return () => {
      alive = false;
    };
  }, [data]);

  return <div className="block-preview-canvas" ref={mountRef} />;
}

/** Pull the camera back to a 3/4 view that fits the build's bounding box, with margin. */
function frameCamera(camera: THREE.PerspectiveCamera | null, size: THREE.Vector3): void {
  if (!camera) return;
  const radius = Math.max(size.x, size.y, size.z, 1) * 0.5;
  const fitH = radius / Math.tan((camera.fov * Math.PI) / 360);
  const fitW = fitH / camera.aspect;
  const dist = Math.max(fitH, fitW) * 1.5 + radius; // 1.5 margin + half-depth
  const dir = new THREE.Vector3(1, 0.7, 1).normalize();
  camera.position.copy(dir.multiplyScalar(dist));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

/** Free geometries/materials of a built group. */
function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
