"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

interface PrismaticCoreProps {
  spreadBps?: number;
  isInspecting?: boolean;
  onToggleInspect?: () => void;
}

export default function PrismaticCore3D({
  spreadBps = 10.0,
  isInspecting = false,
  onToggleInspect,
}: PrismaticCoreProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || 380;
    const height = mountRef.current.clientHeight || 280;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#09090b");

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 7.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // Studio lighting matrix
    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.5);
    keyLight.position.set(4, 5, 4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xa0c4ff, 1.2);
    fillLight.position.set(-4, 2, 2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x10b981, 3.0); // Emerald rim
    rimLight.position.set(0, 3, -5);
    scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(0x27272a, 1.0);
    scene.add(ambientLight);

    // Core Group
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // Leg A: Binance Outer Polyhedron (Icosahedron wireframe)
    const geoA = new THREE.IcosahedronGeometry(1.9, 0);
    const matA = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Amber
      wireframe: true,
      roughness: 0.2,
      metalness: 0.9,
    });
    const meshA = new THREE.Mesh(geoA, matA);
    coreGroup.add(meshA);

    // Leg B: Bitget / Counter-Leg Inner Octahedron (Prismatic Emerald)
    const geoB = new THREE.OctahedronGeometry(1.2, 0);
    const matB = new THREE.MeshPhysicalMaterial({
      color: 0x10b981, // Emerald
      roughness: 0.1,
      metalness: 0.8,
      transmission: 0.6,
      ior: 1.5,
      thickness: 0.5,
    });
    const meshB = new THREE.Mesh(geoB, matB);
    coreGroup.add(meshB);

    // Orbital Basis Particle Ring
    const particlesGeo = new THREE.BufferGeometry();
    const particleCount = 72;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 2.6 + (Math.random() - 0.5) * 0.2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    particlesGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particlesMat = new THREE.PointsMaterial({
      color: 0x06b6d4, // Cyan
      size: 0.05,
      transparent: true,
      opacity: 0.7,
    });
    const particleRing = new THREE.Points(particlesGeo, particlesMat);
    coreGroup.add(particleRing);

    // Mouse Spring Physics
    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0;
    let currentRotY = 0;
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      targetRotY += deltaX * 0.008;
      targetRotX += deltaY * 0.008;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Dynamic rotation velocity keyed to live basis spread
      const spreadSpeed = Math.min(Math.max(spreadBps / 20, 0.4), 3.0);

      if (!isDragging) {
        targetRotY += 0.005 * spreadSpeed;
        targetRotX = Math.sin(elapsedTime * 0.5) * 0.2;
      }

      // Spring damping
      currentRotX += (targetRotX - currentRotX) * 0.08;
      currentRotY += (targetRotY - currentRotY) * 0.08;

      coreGroup.rotation.x = currentRotX;
      coreGroup.rotation.y = currentRotY;

      meshA.rotation.y -= 0.002 * spreadSpeed;
      meshB.rotation.x += 0.004 * spreadSpeed;
      particleRing.rotation.y += 0.008 * spreadSpeed;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const newW = mountRef.current.clientWidth;
      const newH = mountRef.current.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      dom.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("resize", handleResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [spreadBps]);

  return (
    <div className="relative w-full h-[280px] bg-surface rounded-xl border border-border overflow-hidden group">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Cyber-Editorial Overlay HUD */}
      <div className="absolute top-3 left-3 flex items-center space-x-2 text-[10px] font-mono text-zinc-400">
        <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
        <span className="tracking-widest uppercase">PRISMATIC CORE // DUAL NEXUS</span>
      </div>

      <div className="absolute top-3 right-3 text-right font-mono">
        <div className="text-[10px] text-zinc-500 uppercase">Live Basis Pulse</div>
        <div className="text-xs font-semibold text-accent-amber">
          {(spreadBps || 0).toFixed(1)} <span className="text-[10px] text-zinc-400">bps</span>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 text-[10px] font-mono text-zinc-500">
        Drag to rotate 3D nexus • Color-coded: Amber (Binance) / Emerald (Bitget)
      </div>

      {onToggleInspect && (
        <button
          onClick={onToggleInspect}
          className="absolute bottom-3 right-3 px-2.5 py-1 text-[10px] font-mono rounded bg-surface-card hover:bg-zinc-800 text-zinc-300 border border-border transition-colors"
        >
          {isInspecting ? "Exit Studio" : "Inspect Mode"}
        </button>
      )}
    </div>
  );
}
