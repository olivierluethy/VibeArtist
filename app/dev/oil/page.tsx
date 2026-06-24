'use client';

import { useRef, useState } from 'react';
import OilPerformance from '@/components/OilPerformance';
import { OIL_FIXTURE } from '@/lib/drawing/oilFixture';

export default function OilDevPage() {
  const [run, setRun] = useState(0); // bump to remount → replay
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const download = () => {
    const canvas = wrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'painting.png'; a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <main style={{ minHeight: '100vh', background: '#161310', color: '#f3ece1', padding: 24 }}>
      <h1 style={{ fontSize: 18 }}>Oil engine — static fixture harness</h1>
      <div style={{ display: 'flex', gap: 10, margin: '12px 0' }}>
        <button onClick={() => setRun((n) => n + 1)}>⟳ Replay</button>
        <button onClick={download}>⬇ Download painted snapshot</button>
      </div>
      <div ref={wrapRef}>
        <OilPerformance key={run} plan={OIL_FIXTURE} onDone={() => {}} />
      </div>
    </main>
  );
}
