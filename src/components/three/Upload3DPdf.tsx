import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  afterDraw,
  applyStudioEnvironment,
  createPdfPageTexture,
  createStudioRenderer,
  detectSoftwareWebGL,
  isWebGLAvailable,
} from './threeUtils';

export const Upload3DPdf: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !isWebGLAvailable()) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const w = container.clientWidth || 160;
    const h = container.clientHeight || 160;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 30);
    camera.position.set(0, 0.2, 3.8);

    const renderer = createStudioRenderer(container, isSoftwareGl);
    renderer.setSize(w, h);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    const envTex = applyStudioEnvironment(scene, renderer);

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.9);
    const dir = new THREE.DirectionalLight(0xffffff, 1.8);
    dir.position.set(2, 4, 4);
    scene.add(hemi, dir);

    const tex = createPdfPageTexture('Your Syllabus', 'Ready to Scan', '#3B82F6', renderer);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.3 });
    const pdfMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.7, 0.08),
      [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, edgeMat]
    );
    const scanRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.025, 10, 48),
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.6,
      })
    );
    scanRing.rotation.x = Math.PI / 2;

    scene.add(pdfMesh, scanRing);

    const startMs = performance.now();
    let frameId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const t = (performance.now() - startMs) / 1000;
      pdfMesh.rotation.y = Math.sin(t * 1.1) * 0.35;
      pdfMesh.position.y = Math.sin(t * 1.7) * 0.08;
      scanRing.position.y = Math.sin(t * 2.2) * 0.75;
      renderer.render(scene, camera);
      if (isSoftwareGl) frameId = afterDraw(renderer, tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      pdfMesh.geometry.dispose();
      scanRing.geometry.dispose();
      edgeMat.dispose();
      faceMat.dispose();
      (scanRing.material as THREE.Material).dispose();
      tex.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="w-36 h-36 mx-auto pointer-events-none" />;
};
