'use client';

import type { DrawingPlan } from '@/lib/drawing/types';
import { shareText } from '@/lib/share';

export default function ResultView({
  plan,
  config,
  onRestart,
}: {
  plan: DrawingPlan;
  config: { team: string; player?: string };
  onRestart: () => void;
}) {
  function download() {
    const a = document.createElement('a');
    a.href = plan.colorImage;
    a.download = 'drawmyai-portrait.svg';
    a.click();
  }

  async function share() {
    const text = shareText(config);
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(text);
    alert('Caption copied to clipboard!');
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <h2 className="font-serif text-3xl">Your portrait</h2>
      <div className="rounded-sm border-[10px] border-[var(--wood)] bg-[var(--canvas)] shadow-2xl">
        <img src={plan.colorImage} alt="Your portrait" style={{ width: plan.width, height: plan.height }} />
      </div>
      <div className="flex gap-3">
        <button className="btn-gold" onClick={download}>Download</button>
        <button className="btn-gold" onClick={share}>Share</button>
      </div>
      <button className="underline opacity-70" onClick={onRestart}>Draw another</button>
    </div>
  );
}
