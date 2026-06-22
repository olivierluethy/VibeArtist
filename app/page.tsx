'use client';

import { useState } from 'react';
import { INITIAL_STATE, nextStep, type AppState } from '@/lib/flow';
import { WORLD_CUP_FIXTURE } from '@/lib/drawing/fixtures';
import EaselScreen from '@/components/EaselScreen';

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
        <section className="space-y-6">
          <h2 className="text-2xl">Your photo</h2>
          <p className="opacity-60">(placeholder — camera/upload arrives in Task 6)</p>
          <button className="btn-gold" onClick={() => advance({ photo: 'placeholder' })}>Use sample photo</button>
        </section>
      )}

      {state.step === 'vibe' && (
        <section className="space-y-6">
          <h2 className="text-2xl">Pick your team</h2>
          <p className="opacity-60">(placeholder — vibe picker arrives in Task 7)</p>
          <button className="btn-gold" onClick={() => advance({ config: { team: 'Brazil' } })}>Brazil</button>
        </section>
      )}

      {state.step === 'preparing' && (
        <section className="space-y-6">
          <h2 className="text-2xl">The artist is preparing…</h2>
          <button className="btn-gold" onClick={() => advance({ plan: WORLD_CUP_FIXTURE })}>Reveal easel</button>
        </section>
      )}

      {state.step === 'performance' && state.plan && (
        <EaselScreen plan={state.plan} onDone={() => advance()} />
      )}

      {state.step === 'result' && (
        <section className="space-y-6">
          <h2 className="text-2xl">Your portrait</h2>
          <p className="opacity-60">(placeholder — download/share arrives in Task 8)</p>
        </section>
      )}
    </main>
  );
}
