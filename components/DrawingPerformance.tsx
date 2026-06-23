'use client';

import { useEffect, useRef, useState } from 'react';
import type { DrawingPlan } from '@/lib/drawing/types';
import { computeRenderState } from '@/lib/drawing/performanceScheduler';

interface Props {
  plan: DrawingPlan;
  onDone: () => void;
}

const SCRIBBLE_TEETH = 16; // zig-zags across the coloring front
const BAND = 64; // height (px) of the scribbled reveal front

export default function DrawingPerformance({ plan, onDone }: Props) {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [, force] = useState(0);
  const stateRef = useRef(computeRenderState(plan, 0));
  const handRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorImgRef = useRef<HTMLImageElement | null>(null);
  const doneRef = useRef(false);

  // Preload the color portrait off-DOM as the canvas source.
  useEffect(() => {
    // No crossOrigin: we only drawImage (never read pixels), so a tainted canvas is
    // fine — and setting crossOrigin would make fal images fail to load without CORS.
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

      // Self-drawing strokes via dashoffset.
      plan.strokePaths.forEach((_, i) => {
        const el = pathRefs.current[i];
        if (!el) return;
        const len = el.getTotalLength();
        el.style.strokeDasharray = String(len);
        el.style.strokeDashoffset = String(len * (1 - s.strokeFractions[i]));
      });

      // Progressive coloring: reveal the portrait top-to-bottom through a scribble front.
      paintColor(canvasRef.current, colorImgRef.current, plan.width, plan.height, s.colorProgress);

      // Hand: rides the active stroke during outline, then the coloring front.
      const hand = handRef.current;
      if (hand) {
        if (s.phase === 'color') {
          const frontY = s.colorProgress * (plan.height + BAND);
          const sweep = (Math.sin(s.colorProgress * Math.PI * SCRIBBLE_TEETH) * 0.5 + 0.5) * plan.width;
          hand.style.opacity = '1';
          hand.style.transform = `translate(${sweep}px, ${frontY - 44}px)`;
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
      {/* Grayscale shading sits behind everything; below the coloring front it's the b/w sketch. */}
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
      {/* Color is painted on progressively here, covering the sketch as the front descends. */}
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

/** Reveal the color portrait top-to-bottom through a scribbled, colored-pencil front. */
function paintColor(
  canvas: HTMLCanvasElement | null,
  img: HTMLImageElement | null,
  w: number,
  h: number,
  progress: number,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // jsdom / unsupported environment

  ctx.clearRect(0, 0, w, h);
  if (progress <= 0 || !img || !img.complete || img.naturalWidth === 0) return;

  const frontY = progress * (h + BAND);
  const solidY = Math.max(0, frontY - BAND);

  // Clip = fully revealed area above, plus a jagged scribble band at the front.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, solidY);
  const dx = w / SCRIBBLE_TEETH;
  for (let i = 0; i <= SCRIBBLE_TEETH; i++) {
    const x = w - i * dx;
    const y = solidY + (i % 2 === 0 ? BAND * 0.35 : BAND);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(0, solidY);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();

  // Colored-pencil hatching at the moving front for a hand-shaded texture.
  if (progress < 1) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3a2a1a';
    ctx.beginPath();
    for (let x = 0; x < w; x += 9) {
      ctx.moveTo(x, solidY + BAND * 0.2);
      ctx.lineTo(x + 7, frontY);
    }
    ctx.stroke();
    ctx.restore();
  }
}
