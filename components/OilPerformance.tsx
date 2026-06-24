'use client';

import { useEffect, useRef, useState } from 'react';
import type { OilDrawingPlan } from '@/lib/drawing/oilTypes';
import { computeOilState } from '@/lib/drawing/oilScheduler';
import { paintOilStroke, paintGround } from '@/lib/drawing/oilBrush';

interface Props { plan: OilDrawingPlan; onDone: () => void; }

const TOOL_SRC: Record<string, string> = {
  pencil: '/hand.svg', brushBig: '/hand.svg', brushMid: '/hand.svg', brushFine: '/hand.svg', pen: '/hand.svg',
};
const TOOL_SCALE: Record<string, number> = {
  pencil: 0.9, brushBig: 1.8, brushMid: 1.2, brushFine: 0.8, pen: 0.7,
};

export default function OilPerformance({ plan, onDone }: Props) {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handRef = useRef<HTMLImageElement | null>(null);
  const cursorRef = useRef(0);
  const doneRef = useRef(false);
  const [, force] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (canvas && ctx) {
      canvas.width = plan.width * dpr;
      canvas.height = plan.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintGround(ctx, plan.width, plan.height);
      cursorRef.current = 0;
    }

    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const s = computeOilState(plan, ts - start);

      // Sketch self-draw (bottom layer).
      plan.strokePaths.forEach((_, i) => {
        const el = pathRefs.current[i];
        if (!el) return;
        const len = el.getTotalLength();
        el.style.strokeDasharray = String(len);
        el.style.strokeDashoffset = String(len * (1 - (s.sketchFractions[i] ?? 0)));
      });

      // Accumulating bitmap: paint only the newly-due strokes, once each.
      if (ctx) {
        if (s.oilDrawn < cursorRef.current) { // remount/reset safety
          paintGround(ctx, plan.width, plan.height);
          cursorRef.current = 0;
        }
        for (let i = cursorRef.current; i < s.oilDrawn; i++) paintOilStroke(ctx, plan.oilStrokes[i]);
        cursorRef.current = s.oilDrawn;
      }

      // Hand/tool (top layer) rides the active stroke; lifts at done.
      const hand = handRef.current;
      if (hand) {
        if (s.phase === 'done' || (s.activeOil == null && s.activeSketch == null)) {
          hand.style.opacity = '0';
        } else if (s.activeOil != null && plan.oilStrokes[s.activeOil]) {
          const st = plan.oilStrokes[s.activeOil];
          const scale = s.tool ? TOOL_SCALE[s.tool] : 1;
          hand.src = s.tool ? TOOL_SRC[s.tool] : '/hand.svg';
          hand.style.opacity = '1';
          hand.style.transformOrigin = 'left bottom';
          hand.style.transform = `translate(${st.x}px, ${st.y - 44 * scale}px) scale(${scale})`;
        } else if (s.activeSketch != null) {
          const el = pathRefs.current[s.activeSketch];
          if (el) {
            const pt = el.getPointAtLength(el.getTotalLength() * (s.sketchFractions[s.activeSketch] ?? 0));
            hand.src = '/hand.svg';
            hand.style.opacity = '1';
            hand.style.transform = `translate(${pt.x}px, ${pt.y - 44}px) scale(0.9)`;
          }
        }
      }

      force((n) => n + 1);

      if (s.phase === 'done') {
        if (!doneRef.current) { doneRef.current = true; onDone(); }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan, onDone]);

  return (
    <div className="relative mx-auto" style={{ width: plan.width, height: plan.height }}>
      <svg className="absolute inset-0" width={plan.width} height={plan.height}
           viewBox={`0 0 ${plan.width} ${plan.height}`} fill="none">
        {plan.strokePaths.map((sp, i) => (
          <path key={i} ref={(el) => { pathRefs.current[i] = el; }} d={sp.d}
                stroke="#2a2018" strokeWidth={2.4} strokeLinecap="round" />
        ))}
      </svg>
      <canvas ref={canvasRef} style={{ width: plan.width, height: plan.height }}
              className="pointer-events-none absolute inset-0" />
      <img ref={handRef} src="/hand.svg" alt="" className="pointer-events-none absolute left-0 top-0"
           style={{ opacity: 0, willChange: 'transform' }} />
    </div>
  );
}
