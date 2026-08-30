"use client";

import React, { useEffect, useRef } from 'react';

export const ParticleWaveBackground: React.FC<{ className?: string }> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const rows = 28;
    const cols = 55;
    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      time += 0.02;

      // Dark cyber background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#030508');
      bgGrad.addColorStop(0.5, '#070b14');
      bgGrad.addColorStop(1, '#020407');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Central glowing particle wave
      const centerX = width / 2;
      const centerY = height * 0.46;

      for (let r = 0; r < rows; r++) {
        const alpha = Math.max(0.1, (r / rows) * 0.65);

        for (let c = 0; c < cols; c++) {
          const colX = (c / (cols - 1) - 0.5) * (width * 0.95);

          // Wave equation
          const distFromCenter = Math.sqrt((colX / (width * 0.4)) ** 2 + (r / rows - 0.5) ** 2);
          const wave = Math.sin(c * 0.2 + time + r * 0.15) * 25 * (1 - Math.min(1, distFromCenter * 0.7));
          const microWave = Math.cos(c * 0.4 - time * 1.5) * 8;

          const px = centerX + colX;
          const py = centerY + (r - rows / 2) * 8 + wave + microWave;

          // Particle color based on height
          const isBlue = (c + r) % 3 !== 0;
          ctx.fillStyle = isBlue
            ? `rgba(56, 189, 248, ${alpha})`
            : `rgba(99, 102, 241, ${alpha * 0.8})`;

          const size = (r / rows) * 2.2 + 0.8;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Add a subtle blue glow in the upper central horizon
      const horizonGlow = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, width * 0.45);
      horizonGlow.addColorStop(0, 'rgba(30, 58, 138, 0.25)');
      horizonGlow.addColorStop(0.5, 'rgba(14, 165, 233, 0.08)');
      horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = horizonGlow;
      ctx.fillRect(0, 0, width, height);

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
