'use client';

import type { OilDrawingPlan } from '@/lib/drawing/oilTypes';
import { shareText } from '@/lib/share';

export default function ResultView({
  plan,
  snapshot,
  config,
  onRestart,
}: {
  plan: OilDrawingPlan;
  snapshot: string;
  config: { team: string; player?: string };
  onRestart: () => void;
}) {
  function download() {
    const a = document.createElement('a');
    a.href = snapshot;                       // the PAINTED canvas, NEVER plan.colorImage
    a.download = 'drawmyai-portrait.png';
    a.click();
  }

  async function share() {
    const text = shareText(config);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // unexpected error — fall through to clipboard
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      alert('Caption copied to clipboard!');
    } else {
      alert('Sharing is not supported in this browser.');
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <h2 className="font-serif text-3xl">Your portrait</h2>
      <div className="rounded-sm border-[10px] border-[var(--wood)] bg-[var(--canvas)] shadow-2xl">
        <img src={snapshot} alt="Your portrait" style={{ width: plan.width, height: plan.height }} />
      </div>
      <div className="flex gap-3">
        <button className="btn-gold" onClick={download}>Download</button>
        <button className="btn-gold" onClick={() => { share().catch(console.error); }}>Share</button>
      </div>
      <button className="underline opacity-70" onClick={onRestart}>Draw another</button>
    </div>
  );
}
