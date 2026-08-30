"use client";

import React, { useEffect, useRef } from 'react';

export const CircuitBoardBackground: React.FC<{ className?: string }> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    // Generate circuit paths
    interface Trace {
      points: { x: number; y: number }[];
      pulses: { progress: number; speed: number; length: number; color: string }[];
    }

    const traces: Trace[] = [];
    const gridSize = 40;
    const cols = Math.ceil(width / gridSize);
    const rows = Math.ceil(height / gridSize);

    // Create algorithmic PCB traces
    for (let i = 0; i < 28; i++) {
      const startX = Math.floor(Math.random() * cols) * gridSize;
      const startY = Math.floor(Math.random() * rows) * gridSize;
      const points = [{ x: startX, y: startY }];
      let currentX = startX;
      let currentY = startY;

      const steps = Math.floor(Math.random() * 5) + 3;
      for (let s = 0; s < steps; s++) {
        const dir = Math.random();
        const dist = (Math.floor(Math.random() * 3) + 1) * gridSize;
        if (dir < 0.35) {
          currentX += dist;
        } else if (dir < 0.7) {
          currentY += dist;
        } else {
          // Diagonal 45 deg PCB turn
          currentX += dist;
          currentY += dist;
        }
        points.push({ x: currentX, y: currentY });
      }

      traces.push({
        points,
        pulses: [
          {
            progress: Math.random(),
            speed: 0.003 + Math.random() * 0.005,
            length: 0.2,
            color: Math.random() > 0.5 ? '#38bdf8' : '#c084fc',
          },
        ],
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Background subtle dark gradient
      const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width);
      bgGrad.addColorStop(0, '#0a0f1d');
      bgGrad.addColorStop(1, '#03050a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw background circuit grid lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw static PCB traces & terminal solder pads
      traces.forEach((trace) => {
        ctx.beginPath();
        ctx.moveTo(trace.points[0].x, trace.points[0].y);
        for (let p = 1; p < trace.points.length; p++) {
          ctx.lineTo(trace.points[p].x, trace.points[p].y);
        }
        ctx.strokeStyle = 'rgba(30, 58, 138, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Terminal solder pads
        const first = trace.points[0];
        const last = trace.points[trace.points.length - 1];

        [first, last].forEach((pt) => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
        });

        // Draw animated electric pulses traveling down trace
        trace.pulses.forEach((pulse) => {
          pulse.progress += pulse.speed;
          if (pulse.progress > 1) pulse.progress = 0;

          // Compute total length
          let totalLen = 0;
          const segmentLens: number[] = [];
          for (let i = 0; i < trace.points.length - 1; i++) {
            const dx = trace.points[i + 1].x - trace.points[i].x;
            const dy = trace.points[i + 1].y - trace.points[i].y;
            const l = Math.sqrt(dx * dx + dy * dy);
            segmentLens.push(l);
            totalLen += l;
          }

          if (totalLen === 0) return;

          const currentDist = pulse.progress * totalLen;
          let acc = 0;
          let headX = trace.points[0].x;
          let headY = trace.points[0].y;

          for (let i = 0; i < segmentLens.length; i++) {
            if (currentDist <= acc + segmentLens[i]) {
              const segT = (currentDist - acc) / segmentLens[i];
              headX = trace.points[i].x + (trace.points[i + 1].x - trace.points[i].x) * segT;
              headY = trace.points[i].y + (trace.points[i + 1].y - trace.points[i].y) * segT;
              break;
            }
            acc += segmentLens[i];
          }

          // Glowing energy bead
          ctx.beginPath();
          ctx.arc(headX, headY, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = pulse.color;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        });
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
