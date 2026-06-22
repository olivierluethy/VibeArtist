'use client';

import DrawingPerformance from './DrawingPerformance';
import type { DrawingPlan } from '@/lib/drawing/types';

export default function EaselScreen({ plan, onDone }: { plan: DrawingPlan; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <p className="text-xs tracking-[0.2em] text-[var(--gold)]">THE ARTIST IS DRAWING…</p>
      <div className="rounded-sm border-[10px] border-[var(--wood)] bg-[var(--canvas)] shadow-2xl">
        <DrawingPerformance plan={plan} onDone={onDone} />
      </div>
    </div>
  );
}
