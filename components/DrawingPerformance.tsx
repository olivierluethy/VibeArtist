'use client';

import { useEffect, useRef, useState } from 'react';
import type { BrushStroke, DrawingPlan } from '@/lib/drawing/types';
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

      // Color: paint each brush stroke in its own color, then cross-blend the real photo.
      paintBrush(
        canvasRef.current,
        plan.brushStrokes,
        s.brushFractions,
        colorImgRef.current,
        s.blendOpacity,
        plan.width,
        plan.height,
      );

      // Hand: rides the active outline stroke, then the active brush (scaling with its size).
      const hand = handRef.current;
      if (hand) {
        if (s.phase === 'color' && s.activeBrush != null && plan.brushStrokes[s.activeBrush]) {
          const st = plan.brushStrokes[s.activeBrush];
          const f = s.brushFractions[s.activeBrush] ?? 1;
          const p0 = st.points[0];
          const p1 = st.points[st.points.length - 1];
          const x = p0.x + (p1.x - p0.x) * f;
          const y = p0.y + (p1.y - p0.y) * f;
          const toolScale = Math.max(0.7, Math.min(2.6, st.width / 22)); // bigger brush → bigger tool
          hand.style.opacity = String(1 - s.blendOpacity); // hand bows out as the photo blends in
          hand.style.transformOrigin = 'left bottom';
          hand.style.transform = `translate(${x}px, ${y - 44 * toolScale}px) scale(${toolScale})`;
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

/** Paint each brush stroke (round brush travelling its path), then cross-blend the real photo. */
function paintBrush(
  canvas: HTMLCanvasElement | null,
  strokes: BrushStroke[],
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
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < strokes.length; i++) {
    const f = fractions[i] ?? 0;
    if (f <= 0) continue;
    const st = strokes[i];
    const p0 = st.points[0];
    const p1 = st.points[st.points.length - 1];
    const x = p0.x + (p1.x - p0.x) * f;
    const y = p0.y + (p1.y - p0.y) * f;
    ctx.strokeStyle = st.color;
    ctx.fillStyle = st.color;
    ctx.lineWidth = st.width;
    // A round dab at the start (covers zero-length sweeps), then a brush stroke to the tip.
    ctx.beginPath();
    ctx.arc(p0.x, p0.y, st.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  // Final cross-blend to the real, high-resolution portrait.
  if (blendOpacity > 0 && photo && photo.complete && photo.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = blendOpacity;
    ctx.drawImage(photo, 0, 0, w, h);
    ctx.restore();
  }
}
