"use client";

import React, { useEffect, useRef } from 'react';

export const GeodesicSphereCanvas: React.FC<{ className?: string }> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 280);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 240);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    // Geodesic icosahedron / buckyball vertices
    const t = (1 + Math.sqrt(5)) / 2;
    const baseVertices = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];

    // Normalize and scale
    const radius = Math.min(width, height) * 0.36;
    const vertices = baseVertices.map(([x, y, z]) => {
      const len = Math.sqrt(x * x + y * y + z * z);
      return {
        x: (x / len) * radius,
        y: (y / len) * radius,
        z: (z / len) * radius,
        color: Math.random() > 0.4 ? '#38bdf8' : '#a855f7',
      };
    });

    let angleX = 0.4;
    let angleY = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      angleY += 0.012;
      angleX += 0.004;

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      const centerX = width / 2;
      const centerY = height / 2;

      // Project vertices
      const projected = vertices.map((v) => {
        // Rotate Y
        const x1 = v.x * cosY - v.z * sinY;
        const z1 = v.z * cosY + v.x * sinY;

        // Rotate X
        const y2 = v.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + v.y * sinX;

        const fov = 300;
        const scale = fov / (fov + z2);

        return {
          px: centerX + x1 * scale,
          py: centerY + y2 * scale,
          z: z2,
          scale,
          color: v.color,
        };
      });

      // Draw connecting edges
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const p1 = projected[i];
          const p2 = projected[j];

          const dx = vertices[i].x - vertices[j].x;
          const dy = vertices[i].y - vertices[j].y;
          const dz = vertices[i].z - vertices[j].z;
          const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

          // Connect nearest neighbors in icosahedron
          if (dist3D < radius * 1.25) {
            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            const edgeAlpha = Math.max(0.1, (p1.z + p2.z + radius * 2) / (radius * 4)) * 0.7;
            ctx.strokeStyle = `rgba(125, 211, 252, ${edgeAlpha})`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        }
      }

      // Draw molecular spheres with 3D gradient shading
      projected.sort((a, b) => b.z - a.z);

      projected.forEach((p) => {
        const sphereR = 6 * p.scale;
        const grad = ctx.createRadialGradient(
          p.px - sphereR * 0.3,
          p.py - sphereR * 0.3,
          1,
          p.px,
          p.py,
          sphereR
        );

        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, p.color);
        grad.addColorStop(1, '#0f172a');

        ctx.beginPath();
        ctx.arc(p.px, p.py, sphereR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={`w-full h-full ${className}`} />;
};
