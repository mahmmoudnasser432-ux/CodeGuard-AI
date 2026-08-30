"use client";

import React, { useEffect, useRef } from 'react';

interface Node3D {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  color: string;
  size: number;
  pulseSpeed: number;
  pulsePhase: number;
}

export const NeuralConstellationCanvas: React.FC<{ className?: string }> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 500;
    let height = 400;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        width = Math.max(300, Math.floor(rect.width));
        height = Math.max(280, Math.floor(rect.height || 360));
      } else {
        width = 500;
        height = 400;
      }
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    window.addEventListener('resize', resize);

    // Generate 3D Polyhedral Constellation Nodes
    const nodes: Node3D[] = [];
    const colors = ['#38bdf8', '#00f0ff', '#f97316', '#fb923c', '#ffffff', '#ef4444', '#3b82f6'];
    const nodeCount = 42;

    for (let i = 0; i < nodeCount; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / nodeCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = 130 + Math.random() * 50;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      nodes.push({
        x,
        y,
        z,
        baseX: x,
        baseY: y,
        baseZ: z,
        color: colors[i % colors.length],
        size: Math.random() * 3 + 2.5,
        pulseSpeed: 0.03 + Math.random() * 0.04,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    let angleX = 0.2;
    let angleY = 0;
    let mouseX = 0;
    let mouseY = 0;
    let isHovering = false;

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left - width / 2) * 0.001;
      mouseY = (e.clientY - rect.top - height / 2) * 0.001;
      isHovering = true;
    };

    const onMouseLeave = () => {
      isHovering = false;
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      if (!isHovering) {
        mouseX *= 0.95;
        mouseY *= 0.95;
      }

      angleY += 0.008 + mouseX;
      angleX += 0.004 + mouseY;

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      const centerX = width / 2;
      const centerY = height / 2;
      const fov = 350;

      // Project 3D to 2D
      const projected = nodes.map((node) => {
        // Rotate around Y
        const x1 = node.baseX * cosY - node.baseZ * sinY;
        const z1 = node.baseZ * cosY + node.baseX * sinY;

        // Rotate around X
        const y2 = node.baseY * cosX - z1 * sinX;
        const z2 = z1 * cosX + node.baseY * sinX;

        node.pulsePhase += node.pulseSpeed;

        const scale = fov / (fov + z2 + 180);
        const px = centerX + x1 * scale;
        const py = centerY + y2 * scale;

        return {
          px,
          py,
          scale,
          z: z2,
          color: node.color,
          size: node.size * scale + Math.sin(node.pulsePhase) * 1,
        };
      });

      // Sort by Z for realistic depth
      projected.sort((a, b) => b.z - a.z);

      // Draw glowing lines between close nodes
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const p1 = projected[i];
          const p2 = projected[j];
          const dx = p1.px - p2.px;
          const dy = p1.py - p2.py;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 110) {
            const alpha = (1 - dist / 110) * 0.65 * Math.min(p1.scale, p2.scale);
            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);

            // Is orange/warm or cyan/cool connection
            const isWarm = p1.color.includes('f97316') || p1.color.includes('ef4444') || p2.color.includes('f97316');
            ctx.strokeStyle = isWarm
              ? `rgba(249, 115, 22, ${alpha})`
              : `rgba(56, 189, 248, ${alpha})`;
            ctx.lineWidth = 1.4 * p1.scale;
            ctx.stroke();

            // Occasional traveling spark
            if (Math.random() < 0.015) {
              const sparkT = (Date.now() * 0.003) % 1;
              const sx = p1.px + (p2.px - p1.px) * sparkT;
              const sy = p1.py + (p2.py - p1.py) * sparkT;
              ctx.beginPath();
              ctx.arc(sx, sy, 2 * p1.scale, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.shadowColor = isWarm ? '#f97316' : '#38bdf8';
              ctx.shadowBlur = 10;
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          }
        }
      }

      // Draw nodes with radial light aura
      projected.forEach((p) => {
        const isWarm = p.color.includes('f97316') || p.color.includes('ef4444');

        // Outer glow
        const glow = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, p.size * 4.5);
        glow.addColorStop(0, isWarm ? 'rgba(249, 115, 22, 0.9)' : 'rgba(56, 189, 248, 0.9)');
        glow.addColorStop(0.4, isWarm ? 'rgba(249, 115, 22, 0.3)' : 'rgba(56, 189, 248, 0.3)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.beginPath();
        ctx.arc(p.px, p.py, p.size * 4.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core node
        ctx.beginPath();
        ctx.arc(p.px, p.py, Math.max(1, p.size), 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = isWarm ? '#f97316' : '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className={`w-full h-full block ${className}`} />;
};
