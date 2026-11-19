import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  afterDraw,
  applyStudioEnvironment,
  createPdfPageTexture,
  createStudioRenderer,
  detectSoftwareWebGL,
  isWebGLAvailable,
} from './threeUtils';

interface HeroBrainCanvasProps {
  reducedMotion?: boolean;
  onCardClick?: (topic: string) => void;
}

export const HeroBrainCanvas: React.FC<HeroBrainCanvasProps> = ({
  reducedMotion = false,
  onCardClick,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const reducedMotionRef = useRef(reducedMotion);
  const onCardClickRef = useRef(onCardClick);
  const [webglReady, setWebglReady] = useState(true);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    onCardClickRef.current = onCardClick;
  }, [onCardClick]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    if (!isWebGLAvailable()) {
      setWebglReady(false);
      return;
    }

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || 560;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.4, 7.6);

    const renderer = createStudioRenderer(container, isSoftwareGl);
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const envTex = applyStudioEnvironment(scene, renderer);

    // Warm/cool 3-point studio lighting
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e1b4b, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1e6, 2.2);
    keyLight.position.set(4, 6, 5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7c3aed, 1.8);
    rimLight.position.set(-5, 2, -4);
    scene.add(rimLight);

    const cyanAccent = new THREE.PointLight(0x06b6d4, 2.0, 14);
    cyanAccent.position.set(2.5, -2, 3);
    scene.add(cyanAccent);

    // Composite Hero Group: AI Brain + Neural Lattice + Graduation Cap + Orbitals
    const brainRoot = new THREE.Group();
    scene.add(brainRoot);

    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.45,
      metalness: 0.25,
      roughness: 0.2,
      clearcoat: 1.0,
    });

    const leftLobeGeo = new THREE.IcosahedronGeometry(0.95, 2);
    leftLobeGeo.scale(0.86, 1.05, 1.12);
    const leftLobe = new THREE.Mesh(leftLobeGeo, coreMat);
    leftLobe.position.set(-0.52, 0, 0);

    const rightLobe = new THREE.Mesh(leftLobeGeo, coreMat);
    rightLobe.position.set(0.52, 0, 0);

    const wireMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.5,
      wireframe: true,
      roughness: 0.35,
      metalness: 0.8,
    });
    const latticeGeo = new THREE.IcosahedronGeometry(1.42, 1);
    const neuralLattice = new THREE.Mesh(latticeGeo, wireMat);

    const innerGlowMat = new THREE.MeshStandardMaterial({
      color: 0x7c3aed,
      emissive: 0x6d28d9,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.4,
    });
    const innerCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), innerGlowMat);

    // Gyroscopic Rings
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      metalness: 0.9,
      roughness: 0.18,
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.028, 12, 64), ringMat);
    ring1.rotation.x = Math.PI / 3;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.022, 12, 64), ringMat);
    ring2.rotation.y = Math.PI / 2.6;

    // Graduation Cap Composite atop AI Brain
    const capGroup = new THREE.Group();
    capGroup.position.set(0, 1.48, 0);
    capGroup.rotation.z = -0.08;
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.7,
      roughness: 0.25,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.92,
      roughness: 0.18,
    });
    const capBase = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.56, 0.32, 6), capMat);
    const mortarboard = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.07, 1.38), capMat);
    mortarboard.position.y = 0.2;
    mortarboard.rotation.y = Math.PI / 4;
    const capButton = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), goldMat);
    capButton.position.y = 0.25;
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 8), goldMat);
    tassel.position.set(0.62, 0.0, 0.0);
    capGroup.add(capBase, mortarboard, capButton, tassel);

    brainRoot.add(leftLobe, rightLobe, neuralLattice, innerCore, ring1, ring2, capGroup);

    // Floating 3D PDF Document Cards
    const pdfGroup = new THREE.Group();
    scene.add(pdfGroup);
    const cardSpecs = [
      { title: 'Syllabus Ch. 1', sub: 'Pages 1-14', color: '#3B82F6', pos: [-2.55, 1.05, 0.5] },
      { title: 'Physics Notes', sub: 'Pages 15-32', color: '#7C3AED', pos: [2.6, 0.75, 0.4] },
      { title: 'Bio Diagrams', sub: 'OCR Verified', color: '#06B6D4', pos: [2.15, -1.35, 0.85] },
    ];
    const pdfMeshes: THREE.Mesh[] = [];
    const pdfTextures: THREE.Texture[] = [];
    const cardGeo = new THREE.BoxGeometry(1.05, 1.38, 0.06);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.7,
    });

    cardSpecs.forEach((spec, idx) => {
      const tex = createPdfPageTexture(spec.title, spec.sub, spec.color, renderer);
      pdfTextures.push(tex);
      const frontMat = new THREE.MeshStandardMaterial({
        map: tex,
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0.15,
      });
      const card = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, edgeMat]);
      card.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      card.rotation.y = idx === 0 ? 0.38 : -0.38;
      card.userData = { baseY: spec.pos[1], phase: idx * 1.6, title: spec.title };
      pdfMeshes.push(card);
      pdfGroup.add(card);
    });

    // Floating 3D Question Mark Accent
    const qShape = new THREE.Shape();
    qShape.absarc(0, 0.28, 0.24, Math.PI, -0.35, true);
    qShape.lineTo(0.06, -0.04);
    qShape.lineTo(-0.06, -0.04);
    qShape.lineTo(-0.06, 0.12);
    const qGeo = new THREE.ExtrudeGeometry(qShape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    });
    qGeo.center();
    const qMat = new THREE.MeshPhysicalMaterial({
      color: 0x22d3ee,
      emissive: 0x0891b2,
      emissiveIntensity: 0.65,
      metalness: 0.6,
      roughness: 0.2,
    });
    const qMarkGroup = new THREE.Group();
    const qTopMesh = new THREE.Mesh(qGeo, qMat);
    const qDotMesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), qMat);
    qDotMesh.position.y = -0.36;
    qMarkGroup.add(qTopMesh, qDotMesh);
    qMarkGroup.position.set(-2.35, -1.15, 0.7);
    scene.add(qMarkGroup);

    // Knowledge Particles via InstancedMesh (90 particles)
    const particleCount = 90;
    const pGeo = new THREE.OctahedronGeometry(0.045, 0);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.5,
    });
    const particles = new THREE.InstancedMesh(pGeo, pMat, particleCount);
    particles.frustumCulled = false;
    const particleOrbits = Array.from({ length: particleCount }, (_, i) => ({
      radius: 2.3 + (i % 7) * 0.28,
      speed: 0.22 + (i % 5) * 0.08,
      angle: (i / particleCount) * Math.PI * 2,
      yOffset: ((i % 11) - 5) * 0.28,
    }));
    scene.add(particles);

    // Pre-allocated scratch helpers (zero GC inside animation loop)
    const _dummy = new THREE.Object3D();
    const _pointer = new THREE.Vector2(0, 0);
    const _raycaster = new THREE.Raycaster();
    let targetRotX = 0;
    let targetRotY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      targetRotY = _pointer.x * 0.32;
      targetRotX = -_pointer.y * 0.18;
    };

    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(pdfMeshes, false);
      if (hits.length > 0 && onCardClickRef.current) {
        onCardClickRef.current(String(hits[0].object.userData.title || 'Syllabus'));
      }
    };

    const handleContextLost = (ev: Event) => {
      ev.preventDefault();
      setWebglReady(false);
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 560;
      const h = container.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const startMs = performance.now();
    let lastMs = startMs;
    let frameId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const nowMs = performance.now();
      const delta = Math.min((nowMs - lastMs) / 1000, 0.1);
      lastMs = nowMs;
      const elapsed = (nowMs - startMs) / 1000;
      const motionScale = reducedMotionRef.current ? 0.08 : 1;

      brainRoot.rotation.y += delta * 0.36 * motionScale;
      brainRoot.rotation.x = THREE.MathUtils.damp(brainRoot.rotation.x, targetRotX, 4, delta);
      brainRoot.position.y = Math.sin(elapsed * 1.4) * 0.12 * motionScale;
      neuralLattice.rotation.y -= delta * 0.24 * motionScale;
      ring1.rotation.z += delta * 0.45 * motionScale;
      ring2.rotation.x -= delta * 0.35 * motionScale;

      pdfGroup.rotation.y = THREE.MathUtils.damp(pdfGroup.rotation.y, targetRotY * 0.6, 3.5, delta);
      for (const card of pdfMeshes) {
        const phase = Number(card.userData.phase || 0);
        const baseY = Number(card.userData.baseY || 0);
        card.position.y = baseY + Math.sin(elapsed * 1.6 + phase) * 0.14 * motionScale;
      }

      qMarkGroup.position.y = -1.15 + Math.cos(elapsed * 1.8) * 0.14 * motionScale;
      qMarkGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.45 * motionScale;

      for (let i = 0; i < particleCount; i++) {
        const p = particleOrbits[i];
        const a = p.angle + elapsed * p.speed * motionScale;
        _dummy.position.set(
          Math.cos(a) * p.radius,
          p.yOffset + Math.sin(elapsed + i) * 0.12 * motionScale,
          Math.sin(a) * p.radius
        );
        _dummy.rotation.set(a, a * 0.5, 0);
        _dummy.updateMatrix();
        particles.setMatrixAt(i, _dummy.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;

      renderer.render(scene, camera);

      if (reducedMotionRef.current) {
        return;
      }
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
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material?.dispose();
          }
        }
      });
      pdfTextures.forEach((t) => t.dispose());
      envTex.dispose();
      renderer.dispose();
    };
  }, [reducedMotion]);

  return (
    <div className="relative w-full h-[360px] sm:h-[440px] lg:h-[500px] select-none">
      {webglReady ? (
        <div
          ref={mountRef}
          data-testid="hero-3d-canvas"
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />
      ) : (
        <div className="w-full h-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
          <img
            src="/src/assets/images/ai_learning_lab_1795015261196.jpg"
            alt="AI QUIZ MASTER 3D neural core and floating syllabus documents"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
};
