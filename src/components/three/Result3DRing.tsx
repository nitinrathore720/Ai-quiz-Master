import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  afterDraw,
  applyStudioEnvironment,
  createStudioRenderer,
  detectSoftwareWebGL,
  isWebGLAvailable,
} from './threeUtils';

interface Result3DRingProps {
  percentage: number;
}

export const Result3DRing: React.FC<Result3DRingProps> = ({ percentage }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !isWebGLAvailable()) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const w = container.clientWidth || 220;
    const h = container.clientHeight || 220;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 40);
    camera.position.set(0, 0, 4.6);

    const renderer = createStudioRenderer(container, isSoftwareGl);
    renderer.setSize(w, h);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    const envTex = applyStudioEnvironment(scene, renderer);

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.9);
    const dir = new THREE.DirectionalLight(0xfff1e6, 2.0);
    dir.position.set(3, 4, 5);
    scene.add(hemi, dir);

    const ringGroup = new THREE.Group();
    scene.add(ringGroup);

    const track = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.12, 16, 64),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.4 })
    );

    const arcRatio = Math.max(0.06, Math.min(1, percentage / 100));
    const accentColor = percentage >= 75 ? 0x10b981 : percentage >= 50 ? 0x3b82f6 : 0xf59e0b;
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.14, 16, 64, Math.PI * 2 * arcRatio),
      new THREE.MeshPhysicalMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.35,
        metalness: 0.4,
        roughness: 0.2,
        clearcoat: 1,
      })
    );
    arc.rotation.z = Math.PI / 2;

    const badgeCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.46, 0),
      new THREE.MeshPhysicalMaterial({
        color: 0x7c3aed,
        emissive: 0x3b82f6,
        emissiveIntensity: 0.45,
        metalness: 0.7,
        roughness: 0.15,
      })
    );

    ringGroup.add(track, arc, badgeCrystal);

    const startMs = performance.now();
    let lastMs = startMs;
    let frameId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const nowMs = performance.now();
      const dt = Math.min((nowMs - lastMs) / 1000, 0.1);
      lastMs = nowMs;
      const elapsed = (nowMs - startMs) / 1000;
      badgeCrystal.rotation.y += dt * 1.1;
      ringGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.22;
      renderer.render(scene, camera);
      if (isSoftwareGl) frameId = afterDraw(renderer, tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else m.material?.dispose();
        }
      });
      envTex.dispose();
      renderer.dispose();
    };
  }, [percentage]);

  return (
    <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-display text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
};
