'use client';

import { useState, useEffect } from 'react';
import { INITIAL_STATE, nextStep, type AppState } from '@/lib/flow';
import { isKiosk, IDLE_RESET_MS } from '@/lib/kiosk';
import type { OilDrawingPlan } from '@/lib/drawing/oilTypes';
import EaselScreen from '@/components/EaselScreen';
import InputStep from '@/components/InputStep';
import VibePicker from '@/components/VibePicker';
import ResultView from '@/components/ResultView';

export default function Home() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const advance = (patch: Partial<AppState> = {}) =>
    setState((s) => ({ ...s, ...patch, step: nextStep(s.step) }));

  useEffect(() => {
    if (state.step !== 'result') return;
    if (typeof window === 'undefined' || !isKiosk(window.location.search)) return;
    const id = setTimeout(() => setState(INITIAL_STATE), IDLE_RESET_MS);
    return () => clearTimeout(id);
  }, [state.step]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 text-center">
      {state.step === 'start' && (
        <section className="space-y-6">
          <h1 className="font-serif text-5xl">DrawMyAI</h1>
          <p className="opacity-70">Watch an artist draw you — in seconds.</p>
          <button className="btn-gold" onClick={() => advance()}>Begin</button>
        </section>
      )}

      {state.step === 'input' && (
        <InputStep onPhoto={(photo) => advance({ photo })} />
      )}

      {state.step === 'vibe' && (
        <VibePicker onConfirm={(config) => advance({ config })} />
      )}

      {state.step === 'preparing' && (
        <Preparing
          photo={state.photo!}
          config={state.config!}
          onReady={(plan) => advance({ plan })}
        />
      )}

      {state.step === 'performance' && state.plan && (
        <EaselScreen plan={state.plan} onDone={() => advance()} />
      )}

      {state.step === 'result' && state.plan && state.config && (
        <ResultView
          plan={state.plan}
          config={state.config}
          onRestart={() => setState(INITIAL_STATE)}
        />
      )}
    </main>
  );
}

function Preparing({
  photo,
  config,
  onReady,
}: {
  photo: string;
  config: { team: string; player?: string };
  onReady: (plan: OilDrawingPlan) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pct, setPct] = useState(0);

  // Honest, time-based progress: eases toward ~95% over ~18s (typical generation),
  // never claiming 100% until the plan actually arrives and we advance.
  useEffect(() => {
    setPct(0);
    const id = setInterval(() => setPct((p) => p + (96 - p) * 0.05), 250);
    return () => clearInterval(id);
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // Guard against a hung request (e.g. a server error that sends no response).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    (async () => {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ selfie: photo, team: config.team, player: config.player }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`generate failed: ${res.status}`);
        const plan = (await res.json()) as OilDrawingPlan;
        if (!cancelled) onReady(plan);
      } catch {
        if (!cancelled) setError('The artist hit a snag and couldn’t finish the portrait.');
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); };
  }, [photo, config, onReady, attempt]);

  if (error) {
    return (
      <section className="space-y-5">
        <h2 className="text-2xl">Hmm, that didn’t work</h2>
        <p className="opacity-70">{error}</p>
        <button className="btn-gold" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </section>
    );
  }

  const stage =
    pct < 45 ? 'Painting your portrait…' : pct < 80 ? 'Inking the outlines…' : 'Setting up the easel…';

  return (
    <section className="space-y-4">
      <h2 className="text-2xl">{stage}</h2>
      <div className="mx-auto h-2 w-64 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-[var(--gold)]"
          style={{ width: `${pct}%`, transition: 'width 250ms linear' }}
        />
      </div>
      <p className="text-sm opacity-50">This takes around 15–20 seconds.</p>
    </section>
  );
}
