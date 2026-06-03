// A small, self-contained 3D preview of a single block for the Block Catalog.
// It runs its own lightweight Three.js scene (separate from the main Viewer) and
// reuses the normal mesh pipeline: `previewBlock` (main) resolves the block into a
// 1×1×1 StructureData, then `buildStructure` + `TextureLoader` turn it into the
// same meshes the viewer would draw. The block slowly auto-rotates.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { api } from '../../api';
import { buildStructure } from '../../viewer/mesh-builder';
import { TextureLoader } from '../../viewer/texture-loader';

export function BlockPreview({ blockId }: { blockId: string | null }) {
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
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(2.4, 1.9, 2.4);
    camera.lookAt(0, 0, 0);

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
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (contentRef.current) contentRef.current.rotation.y += 0.012;
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

  // (Re)build the previewed block whenever the selection changes.
  useEffect(() => {
    let alive = true;
    const scene = sceneRef.current;
    if (!scene) return;

    // Drop the previous block.
    if (contentRef.current) {
      scene.remove(contentRef.current);
      disposeGroup(contentRef.current);
      contentRef.current = null;
    }
    if (!blockId) return;

    void (async () => {
      try {
        const data = await api.previewBlock(blockId);
        if (!alive) return;
        const textures = await texturesRef.current.load(data.textures);
        if (!alive) return;
        const group = buildStructure(data, textures);
        // Centre the block at the origin so the camera framing is stable.
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
        const wrap = new THREE.Group();
        wrap.add(group);
        scene.add(wrap);
        contentRef.current = wrap;
      } catch {
        /* leave the preview empty on failure */
      }
    })();

    return () => {
      alive = false;
    };
  }, [blockId]);

  return <div className="block-preview-canvas" ref={mountRef} />;
}

/** Free geometries/materials of a built block group. */
function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
