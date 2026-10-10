"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { Compass, RotateCw, Maximize2, RefreshCw, Cpu, Activity, Zap, ShieldCheck } from "lucide-react";

interface ThreeHeroSceneProps {
  spreadBps?: number;
  className?: string;
}

export default function ThreeHeroScene({ spreadBps = 18.5, className = "" }: ThreeHeroSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Telemetry HUD state
  const [pitch, setPitch] = useState<number>(0);
  const [yaw, setYaw] = useState<number>(0);
  const [roll, setRoll] = useState<number>(0);
  const [fps, setFps] = useState<number>(60);
  const [camPos, setCamPos] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 7.2 });
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [isWireframeMode, setIsWireframeMode] = useState<boolean>(true);
  const [sceneLoaded, setSceneLoaded] = useState<boolean>(false);

  // References for render loop
  const autoRotateRef = useRef<boolean>(autoRotate);
  const isWireframeRef = useRef<boolean>(isWireframeMode);
  const mouseRef = useRef<{ x: number; y: number; targetX: number; targetY: number }>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
  });
  const spreadRef = useRef<number>(spreadBps);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    isWireframeRef.current = isWireframeMode;
  }, [isWireframeMode]);

  useEffect(() => {
    spreadRef.current = spreadBps;
  }, [spreadBps]);

  // Main Three.js Scene Setup & Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animId: number;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x09090b, 0.04);

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 7.2);

    // 2. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // 3. Lighting Matrix (3-Point Studio + Dual-Venue Point Lights)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    // Amber Key Light (Binance Venue Side)
    const amberLight = new THREE.PointLight(0xf59e0b, 5, 20);
    amberLight.position.set(-4, 2.5, 3.5);
    scene.add(amberLight);

    // Cyan Fill Light (Bitget Venue Side)
    const cyanLight = new THREE.PointLight(0x06b6d4, 5, 20);
    cyanLight.position.set(4, -2.5, 3.5);
    scene.add(cyanLight);

    // Top Rim Specular Light
    const topLight = new THREE.DirectionalLight(0xffffff, 1.5);
    topLight.position.set(0, 5, 4);
    scene.add(topLight);

    // 4. Sacred Geometry Polyhedron Core Group
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // A. Outer Sacred Icosahedron Wireframe
    const icosaGeometry = new THREE.IcosahedronGeometry(2.1, 1);
    const icosaWireMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      roughness: 0.15,
      metalness: 0.85,
    });
    const icosaMesh = new THREE.Mesh(icosaGeometry, icosaWireMaterial);
    coreGroup.add(icosaMesh);

    // B. Inner Golden Octahedron Core
    const octaGeometry = new THREE.OctahedronGeometry(1.3, 0);
    const octaWireMaterial = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      roughness: 0.2,
      metalness: 0.9,
    });
    const octaMesh = new THREE.Mesh(octaGeometry, octaWireMaterial);
    coreGroup.add(octaMesh);

    // C. Glowing Central Quantum Nucleus
    const nucleusGeometry = new THREE.SphereGeometry(0.38, 24, 24);
    const nucleusMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
    });
    const nucleusMesh = new THREE.Mesh(nucleusGeometry, nucleusMaterial);
    coreGroup.add(nucleusMesh);

    // D. Concentric Celestial Astrolabe Torus Rings
    const ring1Geom = new THREE.TorusGeometry(2.8, 0.015, 16, 80);
    const ring1Mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.45 });
    const ring1 = new THREE.Mesh(ring1Geom, ring1Mat);
    ring1.rotation.x = Math.PI / 3;
    coreGroup.add(ring1);

    const ring2Geom = new THREE.TorusGeometry(3.1, 0.012, 16, 80);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.4 });
    const ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
    ring2.rotation.y = Math.PI / 4;
    ring2.rotation.z = Math.PI / 6;
    coreGroup.add(ring2);

    const ring3Geom = new THREE.TorusGeometry(3.35, 0.01, 16, 80);
    const ring3Mat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.35 });
    const ring3 = new THREE.Mesh(ring3Geom, ring3Mat);
    ring3.rotation.x = -Math.PI / 4;
    ring3.rotation.y = Math.PI / 3;
    coreGroup.add(ring3);

    // 5. Dual-Exchange Orbital Satellites (Binance USD-M & Bitget V3)
    const orbitalRadius = 3.6;

    // Node 1: Binance Node (Amber)
    const binanceGroup = new THREE.Group();
    const bnNodeGeom = new THREE.SphereGeometry(0.25, 20, 20);
    const bnNodeMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.9,
    });
    const bnSphere = new THREE.Mesh(bnNodeGeom, bnNodeMat);
    binanceGroup.add(bnSphere);

    // Mini orbital ring around Binance node
    const bnRingGeom = new THREE.TorusGeometry(0.42, 0.015, 12, 32);
    const bnRingMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.7 });
    const bnRing = new THREE.Mesh(bnRingGeom, bnRingMat);
    bnRing.rotation.x = Math.PI / 2.5;
    binanceGroup.add(bnRing);
    scene.add(binanceGroup);

    // Node 2: Bitget Node (Cyan)
    const bitgetGroup = new THREE.Group();
    const bgNodeGeom = new THREE.SphereGeometry(0.25, 20, 20);
    const bgNodeMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.9,
    });
    const bgSphere = new THREE.Mesh(bgNodeGeom, bgNodeMat);
    bitgetGroup.add(bgSphere);

    // Mini orbital ring around Bitget node
    const bgRingGeom = new THREE.TorusGeometry(0.42, 0.015, 12, 32);
    const bgRingMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.7 });
    const bgRing = new THREE.Mesh(bgRingGeom, bgRingMat);
    bgRing.rotation.x = -Math.PI / 2.5;
    bitgetGroup.add(bgRing);
    scene.add(bitgetGroup);

    // 6. Kinetic Particle Bridge (Inter-Leg Order Flow Stream)
    const particleCount = 70;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    const amberColor = new THREE.Color(0xf59e0b);
    const cyanColor = new THREE.Color(0x06b6d4);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 6;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 4;

      const mixedColor = Math.random() > 0.5 ? amberColor : cyanColor;
      particleColors[i * 3] = mixedColor.r;
      particleColors[i * 3 + 1] = mixedColor.g;
      particleColors[i * 3 + 2] = mixedColor.b;
    }

    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    setSceneLoaded(true);

    // 7. Mouse / Cursor Inertia Event Handlers
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseRef.current.targetX = x * 0.7;
      mouseRef.current.targetY = y * 0.7;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const rect = container.getBoundingClientRect();
        const touch = e.touches[0];
        const x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -(((touch.clientY - rect.top) / rect.height) * 2 - 1);
        mouseRef.current.targetX = x * 0.7;
        mouseRef.current.targetY = y * 0.7;
      }
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("touchmove", handleTouchMove, { passive: true });

    // 8. 60 FPS Render Animation Loop
    let angle = 0;

    const animate = (time: number) => {
      if (document.hidden) {
        animId = requestAnimationFrame(animate);
        return;
      }

      animId = requestAnimationFrame(animate);

      // Measure FPS
      frameCount++;
      if (time - lastFpsTime >= 500) {
        setFps(Math.round((frameCount * 1000) / (time - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = time;
      }

      // Smooth Spring Inertia (lerp)
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      // Rotate Polyhedron Core
      if (autoRotateRef.current) {
        coreGroup.rotation.y += 0.007;
        coreGroup.rotation.x += 0.0035;
      }

      // Apply Mouse Tilting
      coreGroup.rotation.x = (autoRotateRef.current ? coreGroup.rotation.x : 0) + mouseRef.current.y * 0.8;
      coreGroup.rotation.y = (autoRotateRef.current ? coreGroup.rotation.y : 0) + mouseRef.current.x * 0.8;

      // Animate Nested Rings independently
      ring1.rotation.z += 0.005;
      ring2.rotation.x -= 0.004;
      ring3.rotation.y += 0.006;

      // Animate Nucleus Pulse based on live spread
      const pulse = 1 + Math.sin(time * 0.004) * 0.12;
      nucleusMesh.scale.set(pulse, pulse, pulse);

      // Orbit Satellites around Core
      angle += 0.012;
      const bnX = Math.cos(angle) * orbitalRadius;
      const bnZ = Math.sin(angle) * orbitalRadius;
      const bnY = Math.sin(angle * 1.5) * 0.8;
      binanceGroup.position.set(bnX, bnY, bnZ);
      bnRing.rotation.z += 0.03;

      const bgX = Math.cos(angle + Math.PI) * orbitalRadius;
      const bgZ = Math.sin(angle + Math.PI) * orbitalRadius;
      const bgY = Math.sin((angle + Math.PI) * 1.5) * 0.8;
      bitgetGroup.position.set(bgX, bgY, bgZ);
      bgRing.rotation.z -= 0.03;

      // Move point lights along with satellite nodes for dramatic dynamic sheen
      amberLight.position.set(bnX * 1.2, bnY + 1, bnZ * 1.2);
      cyanLight.position.set(bgX * 1.2, bgY - 1, bgZ * 1.2);

      // Animate Particles along Inter-Leg Bridge
      const positions = particleGeometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        // Travel between Binance position and Bitget position
        const t = ((time * 0.0008 + i / particleCount) % 1);
        positions[idx] = bnX + (bgX - bnX) * t + Math.sin(t * Math.PI * 4 + i) * 0.25;
        positions[idx + 1] = bnY + (bgY - bnY) * t + Math.cos(t * Math.PI * 4 + i) * 0.25;
        positions[idx + 2] = bnZ + (bgZ - bnZ) * t;
      }
      particleGeometry.attributes.position.needsUpdate = true;

      // Wireframe mode dynamic update
      icosaWireMaterial.wireframe = isWireframeRef.current;
      octaWireMaterial.wireframe = isWireframeRef.current;

      // Render Scene
      renderer.render(scene, camera);

      // Update Telemetry Gimbal Readouts every 4 frames to avoid excessive React state updates
      if (frameCount % 4 === 0) {
        setPitch(Number((coreGroup.rotation.x * (180 / Math.PI)).toFixed(1)) % 360);
        setYaw(Number((coreGroup.rotation.y * (180 / Math.PI)).toFixed(1)) % 360);
        setRoll(Number((coreGroup.rotation.z * (180 / Math.PI)).toFixed(1)) % 360);
      }
    };

    animId = requestAnimationFrame(animate);

    // 9. Resize Handling
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("touchmove", handleTouchMove);

      // Dispose Three.js assets
      renderer.dispose();
      icosaGeometry.dispose();
      icosaWireMaterial.dispose();
      octaGeometry.dispose();
      octaWireMaterial.dispose();
      nucleusGeometry.dispose();
      nucleusMaterial.dispose();
      ring1Geom.dispose();
      ring1Mat.dispose();
      ring2Geom.dispose();
      ring2Mat.dispose();
      ring3Geom.dispose();
      ring3Mat.dispose();
      bnNodeGeom.dispose();
      bnNodeMat.dispose();
      bnRingGeom.dispose();
      bnRingMat.dispose();
      bgNodeGeom.dispose();
      bgNodeMat.dispose();
      bgRingGeom.dispose();
      bgRingMat.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
    };
  }, []);

  const resetCamera = useCallback(() => {
    mouseRef.current.targetX = 0;
    mouseRef.current.targetY = 0;
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[400px] sm:h-[480px] md:h-[540px] bg-gradient-to-b from-[#0e0e12]/80 via-[#09090b]/95 to-[#09090b] rounded-2xl border border-zinc-800/90 overflow-hidden shadow-2xl group select-none font-mono ${className}`}
    >
      {/* Precision Hairline Background Grid (Anti-Vibe Pattern) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a15_1px,transparent_1px),linear-gradient(to_bottom,#27272a15_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* 3D WebGL Canvas Layer */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* Top Cyber-Editorial Telemetry Gimbal HUD */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none z-10 text-[10px]">
        {/* Venue Connectivity Badges */}
        <div className="flex flex-col space-y-1.5 pointer-events-auto">
          <div className="flex items-center space-x-2 bg-zinc-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-zinc-800/80 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-accent-amber animate-pulse" />
            <span className="font-bold text-accent-amber uppercase tracking-wider">BINANCE USD-M</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400 font-mono">NODE A</span>
          </div>

          <div className="flex items-center space-x-2 bg-zinc-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-zinc-800/80 text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" />
            <span className="font-bold text-accent-cyan uppercase tracking-wider">BITGET V3 PERP</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400 font-mono">NODE B</span>
          </div>
        </div>

        {/* Technical Gimbal Telemetry Vector HUD (ALCHE Studio Pattern) */}
        <div className="bg-zinc-950/85 backdrop-blur-md p-2.5 rounded-xl border border-zinc-800/90 shadow-xl space-y-1 text-right pointer-events-auto min-w-[170px]">
          <div className="flex items-center justify-between border-b border-zinc-800/70 pb-1 mb-1">
            <div className="flex items-center space-x-1 text-accent-emerald font-bold">
              <Compass className="w-3 h-3 animate-spin" style={{ animationDuration: "12s" }} />
              <span className="tracking-wider">GIMBAL TELEMETRY</span>
            </div>
            <span className="text-[9px] px-1 rounded bg-emerald-500/10 text-accent-emerald border border-emerald-500/30 font-bold">
              {fps} FPS
            </span>
          </div>

          <div className="flex justify-between text-zinc-400 text-[10px]">
            <span className="text-zinc-500">PITCH θx:</span>
            <span className="text-zinc-200 font-bold">{pitch}°</span>
          </div>
          <div className="flex justify-between text-zinc-400 text-[10px]">
            <span className="text-zinc-500">YAW θy:</span>
            <span className="text-accent-amber font-bold">{yaw}°</span>
          </div>
          <div className="flex justify-between text-zinc-400 text-[10px]">
            <span className="text-zinc-500">ROLL θz:</span>
            <span className="text-accent-cyan font-bold">{roll}°</span>
          </div>
          <div className="flex justify-between text-zinc-400 text-[10px] pt-0.5 border-t border-zinc-800/50">
            <span className="text-zinc-500">DELTA:</span>
            <span className="text-accent-emerald font-bold">&lt; 250ms</span>
          </div>
        </div>
      </div>

      {/* Center Reticle Corner Accents (Anti-Vibe Technical Marks) */}
      <div className="absolute top-4 left-4 w-3 h-3 border-t-2 border-l-2 border-zinc-700/60 pointer-events-none" />
      <div className="absolute top-4 right-4 w-3 h-3 border-t-2 border-r-2 border-zinc-700/60 pointer-events-none" />
      <div className="absolute bottom-4 left-4 w-3 h-3 border-b-2 border-l-2 border-zinc-700/60 pointer-events-none" />
      <div className="absolute bottom-4 right-4 w-3 h-3 border-b-2 border-r-2 border-zinc-700/60 pointer-events-none" />

      {/* Bottom Interactive HUD Control Bar */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
        {/* Core Architecture Status Pill */}
        <div className="bg-zinc-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800/80 flex items-center space-x-2 text-[10px] text-zinc-300 pointer-events-auto">
          <Zap className="w-3 h-3 text-accent-amber" />
          <span className="text-zinc-400">SACRED GEOMETRY CORE:</span>
          <span className="font-bold text-accent-emerald">ATOMIC DUAL HEDGE</span>
          <span className="hidden sm:inline text-zinc-600">•</span>
          <span className="hidden sm:inline text-zinc-400">Drag to inspect in 3D</span>
        </div>

        {/* Tactical Control Buttons */}
        <div className="flex items-center space-x-1.5 bg-zinc-950/80 backdrop-blur-md p-1 rounded-lg border border-zinc-800/80 pointer-events-auto text-[10px]">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-2 py-1 rounded transition-all font-semibold flex items-center space-x-1 active:scale-95 ${
              autoRotate
                ? "bg-amber-500/20 text-accent-amber border border-amber-500/40"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle Continuous Orbit Rotation"
          >
            <RotateCw className="w-3 h-3" />
            <span className="hidden sm:inline">{autoRotate ? "ORBIT ON" : "ORBIT OFF"}</span>
          </button>

          <button
            onClick={() => setIsWireframeMode(!isWireframeMode)}
            className={`px-2 py-1 rounded transition-all font-semibold flex items-center space-x-1 active:scale-95 ${
              isWireframeMode
                ? "bg-cyan-500/20 text-accent-cyan border border-cyan-500/40"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle Wireframe Architecture"
          >
            <Cpu className="w-3 h-3" />
            <span className="hidden sm:inline">{isWireframeMode ? "WIREFRAME" : "SOLID"}</span>
          </button>

          <button
            onClick={resetCamera}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors active:scale-95"
            title="Reset 3D Inertia Viewport"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
