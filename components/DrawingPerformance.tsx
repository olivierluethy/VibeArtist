'use client';

import { useEffect, useRef, useState } from 'react';
import type { ColorCell, DrawingPlan } from '@/lib/drawing/types';
import { computeRenderState } from '@/lib/drawing/performanceScheduler';

interface Props {
  plan: DrawingPlan;
  onDone: () => void;
}

export default function DrawingPerformance({ plan, onDone }: Props) {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [, force] = useState(0);
  const stateRef = useRef(computeRenderState(plan, 0));
  const handRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorImgRef = useRef<HTMLImageElement | null>(null);
  const doneRef = useRef(false);

  // Preload the real portrait off-DOM as the final cross-blend source.
  // No crossOrigin: we only drawImage (never read pixels), so a tainted canvas
  // is fine — and crossOrigin would make fal images fail to load without CORS.
  useEffect(() => {
    const img = new Image();
    img.src = plan.colorImage;
    colorImgRef.current = img;
  }, [plan.colorImage]);

  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const s = computeRenderState(plan, elapsed);
      stateRef.current = s;

      // Outline: self-drawing strokes via dashoffset.
      plan.strokePaths.forEach((_, i) => {
        const el = pathRefs.current[i];
        if (!el) return;
        const len = el.getTotalLength();
        el.style.strokeDasharray = String(len);
        el.style.strokeDashoffset = String(len * (1 - s.strokeFractions[i]));
      });

      // Color: paint each cell in its own color, then cross-blend the real photo.
      paintCells(
        canvasRef.current,
        plan.colorCells,
        s.colorCellFractions,
        colorImgRef.current,
        s.blendOpacity,
        plan.width,
        plan.height,
      );

      // Hand: rides the active stroke (outline), then the active color cell (color).
      const hand = handRef.current;
      if (hand) {
        if (s.phase === 'color' && s.activeColorCell != null && plan.colorCells[s.activeColorCell]) {
          const cell = plan.colorCells[s.activeColorCell];
          const f = s.colorCellFractions[s.activeColorCell] ?? 1;
          hand.style.opacity = String(1 - s.blendOpacity); // hand bows out as the photo blends in
          hand.style.transform = `translate(${cell.x + cell.w / 2}px, ${cell.y + cell.h * f - 44}px)`;
        } else if (s.activeStroke != null) {
          const el = pathRefs.current[s.activeStroke];
          if (el) {
            const len = el.getTotalLength();
            const pt = el.getPointAtLength(len * s.strokeFractions[s.activeStroke]);
            hand.style.opacity = '1';
            hand.style.transform = `translate(${pt.x}px, ${pt.y - 44}px)`;
          }
        } else {
          hand.style.opacity = '0';
        }
      }

      force((n) => n + 1); // re-render to apply layer opacities

      if (s.phase === 'done') {
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan, onDone]);

  const s = stateRef.current;

  return (
    <div className="relative mx-auto" style={{ width: plan.width, height: plan.height }}>
      {/* Grayscale shading behind everything; below the colored cells it's the b/w sketch. */}
      <img
        src={plan.shadingLayer}
        alt=""
        className="absolute inset-0 h-full w-full"
        style={{ opacity: s.shadeOpacity, transition: 'opacity 120ms linear' }}
      />
      <svg
        className="absolute inset-0"
        width={plan.width}
        height={plan.height}
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        fill="none"
      >
        {plan.strokePaths.map((sp, i) => (
          <path
            key={i}
            ref={(el) => { pathRefs.current[i] = el; }}
            d={sp.d}
            stroke="#2a2018"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        ))}
      </svg>
      {/* Color is painted on here, cell by cell, then blended to the real photo. */}
      <canvas
        ref={canvasRef}
        width={plan.width}
        height={plan.height}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <img
        ref={handRef}
        src="/hand.svg"
        alt=""
        className="pointer-events-none absolute left-0 top-0"
        style={{ opacity: 0, willChange: 'transform' }}
      />
    </div>
  );
}

/** Paint each colored cell (active one growing), then cross-blend the real photo over the top. */
function paintCells(
  canvas: HTMLCanvasElement | null,
  cells: ColorCell[],
  fractions: number[],
  photo: HTMLImageElement | null,
  blendOpacity: number,
  w: number,
  h: number,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // jsdom / unsupported environment

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < cells.length; i++) {
    const f = fractions[i] ?? 0;
    if (f <= 0) continue;
    const cell = cells[i];
    ctx.fillStyle = cell.fill;
    // Grow the active cell top-to-bottom; +1 overlap avoids hairline gaps between cells.
    ctx.fillRect(cell.x, cell.y, cell.w + 1, cell.h * f + 1);
  }

  // Final cross-blend to the real, high-resolution portrait.
  if (blendOpacity > 0 && photo && photo.complete && photo.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = blendOpacity;
    ctx.drawImage(photo, 0, 0, w, h);
    ctx.restore();
  }
}
