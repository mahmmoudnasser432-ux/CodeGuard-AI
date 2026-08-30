"use client";

import React, { useEffect, useRef, useState } from 'react';

interface RepoNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'secure' | 'vulnerable';
  region: string;
  detail: string;
}

export const GlobalGlobeCanvas: React.FC<{ className?: string }> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 600);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 450);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    const repoNodes: RepoNode[] = [
      { id: '1', name: 'Repo: Project-X (EU)', lat: 48.85, lng: 2.35, status: 'secure', region: 'EU', detail: 'Score: 98/100' },
      { id: '2', name: 'Repo: Legacy Systems (US)', lat: 37.77, lng: -122.41, status: 'vulnerable', region: 'US', detail: 'Vulnerability Detected' },
      { id: '3', name: 'Repo: CyberCore (AP)', lat: 35.67, lng: 139.65, status: 'secure', region: 'AP', detail: 'Secure' },
      { id: '4', name: 'Repo: Project-K (SA)', lat: -23.55, lng: -46.63, status: 'vulnerable', region: 'SA', detail: 'Warning' },
      { id: '5', name: 'Repo: Alpha-Auth (AU)', lat: -33.86, lng: 151.2, status: 'secure', region: 'AU', detail: 'Secure' },
      { id: '6', name: 'Repo: CloudBase (IN)', lat: 28.61, lng: 77.2, status: 'secure', region: 'IN', detail: 'Secure' },
    ];

    // Pre-generate globe surface particle grid
    const globeDots: { phi: number; theta: number; baseR: number }[] = [];
    const numDots = 420;
    for (let i = 0; i < numDots; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / numDots);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      globeDots.push({ phi, theta, baseR: 1 });
    }

    let rotationY = 0;
    const rotationX = 0.25;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      rotationY += 0.007;

      const globeRadius = Math.min(width, height) * 0.38;
      const centerX = width / 2;
      const centerY = height / 2;

      // Draw background outer glow halo
      const radialHalo = ctx.createRadialGradient(centerX, centerY, globeRadius * 0.7, centerX, centerY, globeRadius * 1.3);
      radialHalo.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
      radialHalo.addColorStop(0.5, 'rgba(30, 58, 138, 0.05)');
      radialHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radialHalo;
      ctx.beginPath();
      ctx.arc(centerX, centerY, globeRadius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Draw wireframe latitude & longitude rings
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;

      // Draw equator and parallel lines
      for (let lat = -60; lat <= 60; lat += 30) {
        const rad = (lat * Math.PI) / 180;
        const r = globeRadius * Math.cos(rad);
        const y = centerY + globeRadius * Math.sin(rad) * Math.cos(rotationX);
        ctx.beginPath();
        ctx.ellipse(centerX, y, r, r * Math.sin(rotationX), 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Render Globe surface particles
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);

      globeDots.forEach((dot) => {
        const theta = dot.theta + rotationY;
        const x3d = globeRadius * Math.sin(dot.phi) * Math.cos(theta);
        const y3d = globeRadius * Math.cos(dot.phi);
        const z3d = globeRadius * Math.sin(dot.phi) * Math.sin(theta);

        // Rotate X
        const yRot = y3d * cosX - z3d * sinX;
        const zRot = z3d * cosX + y3d * sinX;

        if (zRot > -globeRadius * 0.2) {
          const px = centerX + x3d;
          const py = centerY + yRot;
          const alpha = Math.max(0.1, (zRot + globeRadius * 0.2) / (globeRadius * 1.2)) * 0.6;

          ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Project and draw Repository Nodes & Arcs
      const projectedRepos: { repo: RepoNode; px: number; py: number; z: number }[] = [];

      repoNodes.forEach((repo) => {
        const latRad = (repo.lat * Math.PI) / 180;
        const lngRad = (repo.lng * Math.PI) / 180 + rotationY;

        const x3d = globeRadius * Math.cos(latRad) * Math.cos(lngRad);
        const y3d = -globeRadius * Math.sin(latRad);
        const z3d = globeRadius * Math.cos(latRad) * Math.sin(lngRad);

        const yRot = y3d * cosX - z3d * sinX;
        const zRot = z3d * cosX + y3d * sinX;

        const px = centerX + x3d;
        const py = centerY + yRot;

        if (zRot > -globeRadius * 0.25) {
          projectedRepos.push({ repo, px, py, z: zRot });
        }
      });

      // Draw connection arcs between repos
      for (let i = 0; i < projectedRepos.length; i++) {
        for (let j = i + 1; j < projectedRepos.length; j++) {
          const p1 = projectedRepos[i];
          const p2 = projectedRepos[j];

          const isThreatLink = p1.repo.status === 'vulnerable' || p2.repo.status === 'vulnerable';
          const midX = (p1.px + p2.px) / 2;
          const midY = (p1.py + p2.py) / 2 - 30;

          ctx.beginPath();
          ctx.moveTo(p1.px, p1.py);
          ctx.quadraticCurveTo(midX, midY, p2.px, p2.py);
          ctx.strokeStyle = isThreatLink ? 'rgba(239, 68, 68, 0.45)' : 'rgba(34, 197, 94, 0.35)';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          // Traveling cyber packet
          const packetT = (Date.now() * 0.0015 + i) % 1;
          const pktX = (1 - packetT) * (1 - packetT) * p1.px + 2 * (1 - packetT) * packetT * midX + packetT * packetT * p2.px;
          const pktY = (1 - packetT) * (1 - packetT) * p1.py + 2 * (1 - packetT) * packetT * midY + packetT * packetT * p2.py;

          ctx.beginPath();
          ctx.arc(pktX, pktY, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = isThreatLink ? '#ef4444' : '#22c55e';
          ctx.shadowColor = isThreatLink ? '#ef4444' : '#22c55e';
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Draw Repos with pulsating rings
      projectedRepos.forEach(({ repo, px, py }) => {
        const isVuln = repo.status === 'vulnerable';
        const color = isVuln ? '#ef4444' : '#22c55e';
        const pulse = (Math.sin(Date.now() * 0.005) + 1) * 4;

        // Outer pulsing ring
        ctx.beginPath();
        ctx.arc(px, py, 6 + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = isVuln ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Inner glowing core
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Small tag
        ctx.font = '10px "Space Grotesk", sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(repo.name.split(':')[1]?.trim() || repo.name, px + 8, py - 4);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Overlay UI badges */}
      <div className="absolute top-2 left-6 pointer-events-none text-left">
        <div className="bg-black/60 backdrop-blur-md border border-red-500/30 rounded px-2 py-1 text-[11px] text-red-400 inline-block mb-1 shadow-lg">
          <span className="font-semibold">Repo: Legacy Systems (US)</span>
          <p className="text-[9px] text-red-300">● Vulnerability Detected</p>
        </div>
      </div>

      <div className="absolute top-4 right-6 pointer-events-none text-right">
        <div className="bg-black/60 backdrop-blur-md border border-emerald-500/30 rounded px-2 py-1 text-[11px] text-emerald-400 inline-block shadow-lg">
          <span className="font-semibold">Repo: Project-X (EU)</span>
          <p className="text-[9px] text-emerald-300">● Secure</p>
        </div>
      </div>

      <div className="absolute bottom-3 right-8 pointer-events-none">
        <div className="bg-black/70 backdrop-blur-md border border-cyan-500/30 rounded-full px-3 py-1 text-xs text-cyan-300 shadow-cyan-950/50 shadow-md">
          Global Health Score: <span className="font-bold text-white">88/100</span>
        </div>
      </div>
    </div>
  );
};
