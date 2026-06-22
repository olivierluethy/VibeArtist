'use client';

import { useEffect, useRef, useState } from 'react';
import type { DrawingPlan } from '@/lib/drawing/types';
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
  const doneRef = useRef(false);

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

      // Hand position on the active stroke.
      const hand = handRef.current;
      if (hand) {
        if (s.activeStroke != null) {
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
      <img
        src={plan.shadingLayer}
        alt=""
        className="absolute inset-0 h-full w-full"
        style={{ opacity: s.shadeOpacity, transition: 'opacity 120ms linear' }}
      />
      <img
        src={plan.colorImage}
        alt=""
        className="absolute inset-0 h-full w-full"
        style={{ opacity: s.colorOpacity, transition: 'opacity 120ms linear' }}
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
            ref={(el) => (pathRefs.current[i] = el)}
            d={sp.d}
            stroke="#2a2018"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        ))}
      </svg>
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
