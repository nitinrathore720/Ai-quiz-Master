import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  afterDraw,
  applyStudioEnvironment,
  createStudioRenderer,
  detectSoftwareWebGL,
  isWebGLAvailable,
} from './threeUtils';

interface Processing3DCanvasProps {
  stageIndex: number;
}

export const Processing3DCanvas: React.FC<Processing3DCanvasProps> = ({ stageIndex }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef(stageIndex);

  useEffect(() => {
    stageRef.current = stageIndex;
  }, [stageIndex]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !isWebGLAvailable()) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const w = container.clientWidth || 280;
    const h = container.clientHeight || 220;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 50);
    camera.position.set(0, 0.4, 5.2);

    const renderer = createStudioRenderer(container, isSoftwareGl);
    renderer.setSize(w, h);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    const envTex = applyStudioEnvironment(scene, renderer);

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e1b4b, 0.9);
    const dir = new THREE.DirectionalLight(0xfff1e6, 2.0);
    dir.position.set(3, 5, 4);
    scene.add(hemi, dir);

    const group = new THREE.Group();
    scene.add(group);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85, 1),
      new THREE.MeshPhysicalMaterial({
        color: 0x3b82f6,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.55,
        metalness: 0.35,
        roughness: 0.2,
      })
    );
    const ringA = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.035, 12, 48),
      new THREE.MeshStandardMaterial({ color: 0x7c3aed, metalness: 0.85, roughness: 0.2 })
    );
    const ringB = new THREE.Mesh(
      new THREE.TorusGeometry(1.65, 0.025, 12, 48),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.85, roughness: 0.2 })
    );
    ringA.rotation.x = 0.8;
    ringB.rotation.y = 0.9;
    group.add(core, ringA, ringB);

    let lastMs = performance.now();
    let frameId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const nowMs = performance.now();
      const dt = Math.min((nowMs - lastMs) / 1000, 0.1);
      lastMs = nowMs;
      const speed = 1 + stageRef.current * 0.25;
      core.rotation.y += dt * 0.9 * speed;
      ringA.rotation.z += dt * 1.1 * speed;
      ringB.rotation.x -= dt * 0.85 * speed;
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        frameId = afterDraw(renderer, tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
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
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="processing-3d-canvas"
      className="w-64 h-48 mx-auto rounded-xl overflow-hidden"
    />
  );
};
