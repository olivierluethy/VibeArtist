'use client';

import { useState, useEffect } from 'react';
import { INITIAL_STATE, nextStep, type AppState } from '@/lib/flow';
import type { DrawingPlan } from '@/lib/drawing/types';
import EaselScreen from '@/components/EaselScreen';
import InputStep from '@/components/InputStep';
import VibePicker from '@/components/VibePicker';
import ResultView from '@/components/ResultView';

export default function Home() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const advance = (patch: Partial<AppState> = {}) =>
    setState((s) => ({ ...s, ...patch, step: nextStep(s.step) }));

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
  onReady: (plan: DrawingPlan) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ selfie: photo, team: config.team, player: config.player }),
        });
        const plan = (await res.json()) as DrawingPlan;
        if (!cancelled) onReady(plan);
      } catch {
        if (!cancelled) alert('The artist needs a moment — please try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [photo, config, onReady]);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl">The artist is preparing…</h2>
      <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-pulse bg-[var(--gold)]" />
      </div>
    </section>
  );
}
