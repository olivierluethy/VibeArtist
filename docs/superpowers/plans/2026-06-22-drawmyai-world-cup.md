# DrawMyAI (World Cup v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first prototype of DrawMyAI — capture/upload a face, pick a World Cup team, and watch an AI portrait be "hand-drawn" live on a gallery easel, then download/share it.

**Architecture:** Two engines joined by one handoff object, the **Drawing Plan**. Engine 1 (server) turns a selfie + config into a finished portrait, a line-art version, traced SVG stroke paths, and timing — packaged as a Drawing Plan. Engine 2 (browser) *performs* that plan: self-drawing pencil outline → shading → accelerating color flood, with a hand sprite. Engine 2 is built and tested FIRST against a hand-authored fixture Drawing Plan, before any AI is wired up.

**Tech Stack:** Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · Vitest + @testing-library/react + jsdom · `potrace` for raster→SVG tracing · npm.

## Global Constraints

- Next.js App Router (the `app/` directory), TypeScript `strict: true`, Node 18+.
- Image-generation API keys live **server-side only** — never imported into a client component or exposed to the browser.
- v1 ships exactly one vibe: **World Cup**. No other vibe code paths.
- Visual identity: **warm "Gallery Easel"** — cream canvas `#f4efe6`, wood frame `#6b4f2e`, gold accent `#e8c46a`, dark warm backdrop `#14110d`.
- The drawing is a **performance over a pre-generated image** (generate-then-perform), never live model denoising.
- Pacing rule: outline phase is slow/rich; color phase **accelerates** (ease-in) to a fast finish.
- Tests colocated as `*.test.ts` / `*.test.tsx` next to the source file.
- Commit after every task (each task ends green).

---

### Task 1: Project scaffold (Next.js + Tailwind + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `lib/__smoke__/smoke.test.ts`

**Interfaces:**
- Produces: a runnable Next.js app (`npm run dev`) and a passing test command (`npm test`).

- [ ] **Step 1: Scaffold the app**

Run from the repo root (the directory already exists and is a git repo):

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm
```

Accept overwrite if prompted (the only tracked files are `docs/` and `.gitignore`).

- [ ] **Step 2: Add test tooling**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
});
```

- [ ] **Step 4: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Add the test script to `package.json`**

In the `"scripts"` block add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write a smoke test at `lib/__smoke__/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs the test toolchain', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run the smoke test**

Run: `npm test`
Expected: PASS, 1 test passing.

- [ ] **Step 8: Set the warm theme tokens in `app/globals.css`**

Replace the file body (keep the `@tailwind` directives at the top) with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --canvas: #f4efe6;
  --wood: #6b4f2e;
  --gold: #e8c46a;
  --backdrop: #14110d;
}

body {
  background: radial-gradient(circle at 50% 20%, #241f18, var(--backdrop));
  color: #f4efe6;
  min-height: 100vh;
}
```

- [ ] **Step 9: Verify the app boots**

Run: `npm run dev` then open `http://localhost:3000`.
Expected: the default page renders on the warm background. Stop the server.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Tailwind + Vitest with warm theme"
```

---

### Task 2: Drawing Plan types + performance scheduler (Engine 2 core logic)

This is the pure, deterministic heart of the drawing performance. No DOM, fully unit-tested.

**Files:**
- Create: `lib/drawing/types.ts`
- Create: `lib/drawing/performanceScheduler.ts`
- Test: `lib/drawing/performanceScheduler.test.ts`

**Interfaces:**
- Produces:
  - `type StrokePath = { d: string }`
  - `type DrawingPlanTiming = { outlineMs: number; shadeMs: number; colorMs: number; accelerate: boolean }`
  - `type DrawingPlan = { width: number; height: number; strokePaths: StrokePath[]; shadingLayer: string; colorImage: string; timing: DrawingPlanTiming }`
  - `type RenderState = { phase: 'outline'|'shade'|'color'|'done'; strokeFractions: number[]; activeStroke: number|null; shadeOpacity: number; colorOpacity: number }`
  - `computeRenderState(plan: DrawingPlan, elapsedMs: number): RenderState`
  - `easeIn(p: number): number`

- [ ] **Step 1: Create `lib/drawing/types.ts`**

```ts
export interface StrokePath {
  /** SVG path data for one continuous pencil stroke. */
  d: string;
}

export interface DrawingPlanTiming {
  outlineMs: number;
  shadeMs: number;
  colorMs: number;
  /** When true, the color phase eases in (slow start, fast finish). */
  accelerate: boolean;
}

export interface DrawingPlan {
  width: number;
  height: number;
  /** Ordered strokes; drawn one after another during the outline phase. */
  strokePaths: StrokePath[];
  /** Image (URL or data URI) shown during the shading phase. */
  shadingLayer: string;
  /** Final full-color portrait (URL or data URI). */
  colorImage: string;
  timing: DrawingPlanTiming;
}

export type DrawingPhase = 'outline' | 'shade' | 'color' | 'done';

export interface RenderState {
  phase: DrawingPhase;
  /** Per-stroke drawn fraction, 0..1, index-aligned with plan.strokePaths. */
  strokeFractions: number[];
  /** Index of the stroke currently being drawn (for the hand), else null. */
  activeStroke: number | null;
  shadeOpacity: number;
  colorOpacity: number;
}
```

- [ ] **Step 2: Write the failing test `lib/drawing/performanceScheduler.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeRenderState, easeIn } from './performanceScheduler';
import type { DrawingPlan } from './types';

const plan: DrawingPlan = {
  width: 400,
  height: 500,
  strokePaths: [{ d: 'M0 0 L10 0' }, { d: 'M0 10 L10 10' }],
  shadingLayer: 'shade.png',
  colorImage: 'color.png',
  timing: { outlineMs: 1000, shadeMs: 1000, colorMs: 1000, accelerate: true },
};

describe('computeRenderState', () => {
  it('starts in outline with nothing drawn', () => {
    const s = computeRenderState(plan, 0);
    expect(s.phase).toBe('outline');
    expect(s.strokeFractions).toEqual([0, 0]);
    expect(s.activeStroke).toBe(0);
    expect(s.shadeOpacity).toBe(0);
    expect(s.colorOpacity).toBe(0);
  });

  it('draws strokes sequentially during outline', () => {
    // slice = 1000/2 = 500ms per stroke
    const s = computeRenderState(plan, 250);
    expect(s.strokeFractions[0]).toBeCloseTo(0.5);
    expect(s.strokeFractions[1]).toBe(0);
    expect(s.activeStroke).toBe(0);
  });

  it('moves to the second stroke past the first slice', () => {
    const s = computeRenderState(plan, 750);
    expect(s.strokeFractions[0]).toBe(1);
    expect(s.strokeFractions[1]).toBeCloseTo(0.5);
    expect(s.activeStroke).toBe(1);
  });

  it('enters shade with all strokes complete', () => {
    const s = computeRenderState(plan, 1500);
    expect(s.phase).toBe('shade');
    expect(s.strokeFractions).toEqual([1, 1]);
    expect(s.activeStroke).toBeNull();
    expect(s.shadeOpacity).toBeCloseTo(0.5);
    expect(s.colorOpacity).toBe(0);
  });

  it('eases in the color phase when accelerate is true', () => {
    const s = computeRenderState(plan, 2500); // halfway through color
    expect(s.phase).toBe('color');
    expect(s.shadeOpacity).toBe(1);
    expect(s.colorOpacity).toBeCloseTo(0.25); // easeIn(0.5) = 0.25
  });

  it('finishes done with everything at full', () => {
    const s = computeRenderState(plan, 5000);
    expect(s.phase).toBe('done');
    expect(s.strokeFractions).toEqual([1, 1]);
    expect(s.shadeOpacity).toBe(1);
    expect(s.colorOpacity).toBe(1);
    expect(s.activeStroke).toBeNull();
  });

  it('easeIn squares its input', () => {
    expect(easeIn(0.5)).toBeCloseTo(0.25);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- performanceScheduler`
Expected: FAIL — `computeRenderState` not defined.

- [ ] **Step 4: Implement `lib/drawing/performanceScheduler.ts`**

```ts
import type { DrawingPlan, RenderState } from './types';

export function easeIn(p: number): number {
  return p * p;
}

export function computeRenderState(plan: DrawingPlan, elapsedMs: number): RenderState {
  const { strokePaths, timing } = plan;
  const n = strokePaths.length;
  const { outlineMs, shadeMs, colorMs, accelerate } = timing;
  const total = outlineMs + shadeMs + colorMs;
  const t = Math.max(0, elapsedMs);

  if (t >= total) {
    return {
      phase: 'done',
      strokeFractions: new Array(n).fill(1),
      activeStroke: null,
      shadeOpacity: 1,
      colorOpacity: 1,
    };
  }

  if (t < outlineMs) {
    const slice = n > 0 ? outlineMs / n : outlineMs;
    const strokeFractions = strokePaths.map((_, i) => {
      const start = i * slice;
      return Math.min(1, Math.max(0, (t - start) / slice));
    });
    const activeStroke = n > 0 ? Math.min(n - 1, Math.floor(t / slice)) : null;
    return { phase: 'outline', strokeFractions, activeStroke, shadeOpacity: 0, colorOpacity: 0 };
  }

  if (t < outlineMs + shadeMs) {
    const p = shadeMs > 0 ? (t - outlineMs) / shadeMs : 1;
    return {
      phase: 'shade',
      strokeFractions: new Array(n).fill(1),
      activeStroke: null,
      shadeOpacity: Math.min(1, p),
      colorOpacity: 0,
    };
  }

  const p = colorMs > 0 ? (t - outlineMs - shadeMs) / colorMs : 1;
  const colorOpacity = Math.min(1, accelerate ? easeIn(p) : p);
  return {
    phase: 'color',
    strokeFractions: new Array(n).fill(1),
    activeStroke: null,
    shadeOpacity: 1,
    colorOpacity,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- performanceScheduler`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/drawing/
git commit -m "feat: drawing plan types + performance scheduler (Engine 2 core)"
```

---

### Task 3: World Cup fixture Drawing Plan

A self-contained, runnable Drawing Plan (synthetic SVG art as data URIs) so Engine 2 and the whole UI flow work with zero AI. Real art replaces these later.

**Files:**
- Create: `lib/drawing/fixtures.ts`
- Test: `lib/drawing/fixtures.test.ts`

**Interfaces:**
- Consumes: `DrawingPlan`, `StrokePath` from `lib/drawing/types`.
- Produces: `WORLD_CUP_FIXTURE: DrawingPlan` and `svgDataUri(svg: string): string`.

- [ ] **Step 1: Write the failing test `lib/drawing/fixtures.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { WORLD_CUP_FIXTURE, svgDataUri } from './fixtures';

describe('WORLD_CUP_FIXTURE', () => {
  it('is a valid drawing plan with strokes and layers', () => {
    expect(WORLD_CUP_FIXTURE.strokePaths.length).toBeGreaterThan(2);
    expect(WORLD_CUP_FIXTURE.colorImage).toMatch(/^data:image\/svg\+xml/);
    expect(WORLD_CUP_FIXTURE.shadingLayer).toMatch(/^data:image\/svg\+xml/);
    expect(WORLD_CUP_FIXTURE.timing.accelerate).toBe(true);
    expect(WORLD_CUP_FIXTURE.timing.outlineMs).toBeGreaterThan(WORLD_CUP_FIXTURE.timing.colorMs);
  });

  it('encodes svg as a data uri', () => {
    expect(svgDataUri('<svg/>')).toBe('data:image/svg+xml,' + encodeURIComponent('<svg/>'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- fixtures`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/drawing/fixtures.ts`**

```ts
import type { DrawingPlan, StrokePath } from './types';

export function svgDataUri(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const W = 400;
const H = 500;

// Simple stylized face outline, drawn stroke by stroke (head, eyes, nose, mouth, jersey collar).
const STROKES: StrokePath[] = [
  { d: 'M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z' }, // head
  { d: 'M150 180 q20 -15 40 0' }, // left eyebrow
  { d: 'M210 180 q20 -15 40 0' }, // right eyebrow
  { d: 'M160 200 a12 8 0 1 0 0.1 0 Z' }, // left eye
  { d: 'M230 200 a12 8 0 1 0 0.1 0 Z' }, // right eye
  { d: 'M200 210 L195 245 q5 8 12 0' }, // nose
  { d: 'M170 265 q30 22 60 0' }, // mouth
  { d: 'M120 320 L160 360 L200 345 L240 360 L280 320' }, // jersey collar
];

const colorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0b3d91"/>
  <path d="M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z" fill="#f1c79b"/>
  <circle cx="166" cy="202" r="6" fill="#3a2a1a"/>
  <circle cx="236" cy="202" r="6" fill="#3a2a1a"/>
  <path d="M170 265 q30 22 60 0" fill="none" stroke="#a23b2e" stroke-width="4"/>
  <path d="M110 330 L160 380 L200 360 L240 380 L290 330 L290 500 L110 500 Z" fill="#d4202a"/>
  <text x="200" y="455" font-size="40" fill="#ffd700" text-anchor="middle" font-family="Georgia">10</text>
</svg>`;

const shadingSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#efe9dd"/>
  <path d="M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z" fill="#cfc6b6"/>
  <path d="M110 330 L160 380 L200 360 L240 380 L290 330 L290 500 L110 500 Z" fill="#b9b0a0"/>
</svg>`;

export const WORLD_CUP_FIXTURE: DrawingPlan = {
  width: W,
  height: H,
  strokePaths: STROKES,
  shadingLayer: svgDataUri(shadingSvg),
  colorImage: svgDataUri(colorSvg),
  timing: { outlineMs: 18000, shadeMs: 5000, colorMs: 6000, accelerate: true },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- fixtures`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/drawing/fixtures.ts lib/drawing/fixtures.test.ts
git commit -m "feat: self-contained World Cup fixture drawing plan"
```

---

### Task 4: DrawingPerformance component (Engine 2 view — the magic)

Renders a Drawing Plan: SVG strokes that draw themselves via `stroke-dashoffset`, shading and color image layers that fade in per `RenderState`, and a hand sprite riding the active stroke. Driven by `requestAnimationFrame`.

**Files:**
- Create: `components/DrawingPerformance.tsx`
- Create: `public/hand.svg`
- Test: `components/DrawingPerformance.test.tsx`

**Interfaces:**
- Consumes: `DrawingPlan`, `RenderState`, `computeRenderState` from `lib/drawing/*`.
- Produces: `<DrawingPerformance plan={DrawingPlan} onDone={() => void} />` — a default-exported client component.

- [ ] **Step 1: Create the hand sprite `public/hand.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <line x1="6" y1="42" x2="34" y2="14" stroke="#3a2a1a" stroke-width="4" stroke-linecap="round"/>
  <polygon points="34,14 40,8 42,18" fill="#e8c46a"/>
  <circle cx="6" cy="42" r="3" fill="#222"/>
</svg>
```

- [ ] **Step 2: Write the failing test `components/DrawingPerformance.test.tsx`**

jsdom has no real animation clock or `getTotalLength`; we stub them and assert the component mounts and renders one `<path>` per stroke plus the layer images.

```tsx
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import DrawingPerformance from './DrawingPerformance';
import { WORLD_CUP_FIXTURE } from '@/lib/drawing/fixtures';

beforeAll(() => {
  // jsdom lacks SVG geometry APIs used by the component.
  // @ts-expect-error test stub
  SVGPathElement.prototype.getTotalLength = () => 100;
  // @ts-expect-error test stub
  SVGPathElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(0), 0) as unknown as number;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

describe('DrawingPerformance', () => {
  it('renders one path per stroke and both layers', () => {
    const { container } = render(
      <DrawingPerformance plan={WORLD_CUP_FIXTURE} onDone={() => {}} />,
    );
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(WORLD_CUP_FIXTURE.strokePaths.length);
    expect(container.querySelectorAll('img').length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- DrawingPerformance`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `components/DrawingPerformance.tsx`**

```tsx
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- DrawingPerformance`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add components/DrawingPerformance.tsx components/DrawingPerformance.test.tsx public/hand.svg
git commit -m "feat: DrawingPerformance component (Engine 2 self-drawing easel)"
```

---

### Task 5: App flow state machine + the easel screen (magic visible end-to-end)

Wire the six-screen flow with a typed state machine and dummy data so the performance is visible end-to-end on the fixture. Input and vibe are placeholders here; real versions land in Tasks 6–7.

**Files:**
- Create: `lib/flow.ts`
- Create: `components/EaselScreen.tsx`
- Modify: `app/page.tsx` (replace scaffold content)
- Test: `lib/flow.test.ts`

**Interfaces:**
- Produces:
  - `type Step = 'start' | 'input' | 'vibe' | 'preparing' | 'performance' | 'result'`
  - `type AppState = { step: Step; photo: string | null; config: { team: string; player?: string } | null; plan: import('@/lib/drawing/types').DrawingPlan | null }`
  - `nextStep(step: Step): Step`
  - `EaselScreen` — wraps `DrawingPerformance` in the warm wooden easel frame.

- [ ] **Step 1: Write the failing test `lib/flow.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { nextStep } from './flow';

describe('nextStep', () => {
  it('advances through the flow in order', () => {
    expect(nextStep('start')).toBe('input');
    expect(nextStep('input')).toBe('vibe');
    expect(nextStep('vibe')).toBe('preparing');
    expect(nextStep('preparing')).toBe('performance');
    expect(nextStep('performance')).toBe('result');
  });

  it('stays on result at the end', () => {
    expect(nextStep('result')).toBe('result');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- flow`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/flow.ts`**

```ts
import type { DrawingPlan } from './drawing/types';

export type Step = 'start' | 'input' | 'vibe' | 'preparing' | 'performance' | 'result';

export interface AppState {
  step: Step;
  photo: string | null;
  config: { team: string; player?: string } | null;
  plan: DrawingPlan | null;
}

const ORDER: Step[] = ['start', 'input', 'vibe', 'preparing', 'performance', 'result'];

export function nextStep(step: Step): Step {
  const i = ORDER.indexOf(step);
  return i < 0 || i === ORDER.length - 1 ? step : ORDER[i + 1];
}

export const INITIAL_STATE: AppState = { step: 'start', photo: null, config: null, plan: null };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- flow`
Expected: PASS, 2 tests.

- [ ] **Step 5: Create `components/EaselScreen.tsx`**

```tsx
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
```

- [ ] **Step 6: Replace `app/page.tsx`**

```tsx
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
```

- [ ] **Step 7: Add the `.btn-gold` utility to `app/globals.css`**

Append:

```css
.btn-gold {
  background: var(--gold);
  color: #1a1611;
  font-weight: 700;
  padding: 0.7rem 1.8rem;
  border-radius: 9999px;
}
.btn-gold:hover { filter: brightness(1.05); }
```

- [ ] **Step 8: Manually verify the full flow**

Run: `npm run dev`, open `http://localhost:3000`, click Begin → Use sample photo → Brazil → Reveal easel.
Expected: the easel renders and the portrait visibly draws itself stroke-by-stroke, then shading, then color flood, ending on the full portrait. Stop the server.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add app/page.tsx app/globals.css components/EaselScreen.tsx lib/flow.ts lib/flow.test.ts
git commit -m "feat: app flow state machine + easel screen (magic visible end-to-end)"
```

---

### Task 6: Input — camera capture + upload + face presence check

**Files:**
- Create: `lib/face.ts`
- Create: `components/InputStep.tsx`
- Modify: `app/page.tsx` (replace the `input` placeholder)
- Test: `lib/face.test.ts`

**Interfaces:**
- Consumes: `AppState` from `lib/flow`.
- Produces:
  - `hasFace(imageData: ImageData): boolean` — heuristic skin-tone presence check.
  - `<InputStep onPhoto={(dataUrl: string) => void} />` — default-exported client component that yields a captured or uploaded photo as a data URL.

- [ ] **Step 1: Write the failing test `lib/face.test.ts`**

`hasFace` is a cheap heuristic (enough skin-tone pixels) so the prototype rejects obviously-empty images without a heavy model.

```ts
import { describe, it, expect } from 'vitest';
import { hasFace } from './face';

function solid(r: number, g: number, b: number, n = 100): ImageData {
  const data = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width: n, height: n, colorSpace: 'srgb' } as ImageData;
}

describe('hasFace', () => {
  it('accepts an image dominated by skin tones', () => {
    expect(hasFace(solid(225, 175, 140))).toBe(true);
  });
  it('rejects an image with no skin tones', () => {
    expect(hasFace(solid(10, 10, 200))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- face`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/face.ts`**

```ts
/** Cheap heuristic: is a meaningful share of pixels skin-toned? */
export function hasFace(image: ImageData): boolean {
  const { data } = image;
  let skin = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    total++;
    if (
      r > 95 && g > 40 && b > 20 &&
      r > g && r > b &&
      Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
      Math.abs(r - g) > 15
    ) {
      skin++;
    }
  }
  return total > 0 && skin / total > 0.15;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- face`
Expected: PASS, 2 tests.

- [ ] **Step 5: Implement `components/InputStep.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { hasFace } from '@/lib/face';

export default function InputStep({ onPhoto }: { onPhoto: (dataUrl: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (cameraOn) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user' } })
        .then((s) => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(() => {
          setCameraOn(false);
          setError('Camera unavailable — please upload a photo instead.');
        });
    }
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [cameraOn]);

  function emitFromCanvas(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (!hasFace(img)) {
      setError("Hmm, we couldn't find a face — try again with your face centered.");
      return;
    }
    setError(null);
    onPhoto(canvas.toDataURL('image/png'));
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    emitFromCanvas(canvas);
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      emitFromCanvas(canvas);
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl">Your photo</h2>
      {cameraOn ? (
        <div className="space-y-3">
          <div className="relative mx-auto w-72">
            <video ref={videoRef} autoPlay playsInline className="rounded-xl" />
            <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-[var(--gold)]/70" />
          </div>
          <button className="btn-gold" onClick={capture}>Capture</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <button className="btn-gold" onClick={() => setCameraOn(true)}>Use camera</button>
          <label className="cursor-pointer underline opacity-80">
            or upload a photo
            <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
          </label>
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Wire it into `app/page.tsx`** — replace the `input` placeholder block with:

```tsx
{state.step === 'input' && (
  <InputStep onPhoto={(photo) => advance({ photo })} />
)}
```

Add the import at the top: `import InputStep from '@/components/InputStep';`

- [ ] **Step 7: Run the suite and manually verify**

Run: `npm test` (expected: all PASS), then `npm run dev` and confirm the camera/upload step yields a photo and advances (a no-face image shows the friendly error). Stop the server.

- [ ] **Step 8: Commit**

```bash
git add lib/face.ts lib/face.test.ts components/InputStep.tsx app/page.tsx
git commit -m "feat: camera capture + upload with face-presence check"
```

---

### Task 7: VibePicker — team + optional player

**Files:**
- Create: `lib/teams.ts`
- Create: `components/VibePicker.tsx`
- Modify: `app/page.tsx` (replace the `vibe` placeholder)
- Test: `lib/teams.test.ts`

**Interfaces:**
- Produces:
  - `type Team = { id: string; name: string; emoji: string; players: string[] }`
  - `TEAMS: Team[]`
  - `findTeam(id: string): Team | undefined`
  - `<VibePicker onConfirm={(config: { team: string; player?: string }) => void} />`

- [ ] **Step 1: Write the failing test `lib/teams.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { TEAMS, findTeam } from './teams';

describe('teams', () => {
  it('exposes several teams each with players', () => {
    expect(TEAMS.length).toBeGreaterThanOrEqual(4);
    for (const t of TEAMS) expect(t.players.length).toBeGreaterThan(0);
  });
  it('looks up a team by id', () => {
    expect(findTeam('brazil')?.name).toBe('Brazil');
    expect(findTeam('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- teams`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/teams.ts`**

```ts
export interface Team {
  id: string;
  name: string;
  emoji: string;
  players: string[];
}

export const TEAMS: Team[] = [
  { id: 'brazil', name: 'Brazil', emoji: '🇧🇷', players: ['Neymar', 'Vinícius', 'Rodrygo'] },
  { id: 'argentina', name: 'Argentina', emoji: '🇦🇷', players: ['Messi', 'Álvarez', 'Martínez'] },
  { id: 'france', name: 'France', emoji: '🇫🇷', players: ['Mbappé', 'Griezmann', 'Dembélé'] },
  { id: 'usa', name: 'USA', emoji: '🇺🇸', players: ['Pulisic', 'Weah', 'Reyna'] },
  { id: 'england', name: 'England', emoji: '🏴', players: ['Bellingham', 'Kane', 'Saka'] },
  { id: 'portugal', name: 'Portugal', emoji: '🇵🇹', players: ['Ronaldo', 'Fernandes', 'Leão'] },
];

export function findTeam(id: string): Team | undefined {
  return TEAMS.find((t) => t.id === id);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- teams`
Expected: PASS, 2 tests.

- [ ] **Step 5: Implement `components/VibePicker.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { TEAMS, findTeam } from '@/lib/teams';

export default function VibePicker({
  onConfirm,
}: {
  onConfirm: (config: { team: string; player?: string }) => void;
}) {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [player, setPlayer] = useState<string | undefined>(undefined);
  const team = teamId ? findTeam(teamId) : undefined;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl">Pick your team</h2>
      <div className="grid grid-cols-3 gap-3">
        {TEAMS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTeamId(t.id); setPlayer(undefined); }}
            className={`rounded-xl border p-4 transition ${
              teamId === t.id ? 'border-[var(--gold)] bg-white/5' : 'border-white/15'
            }`}
          >
            <div className="text-3xl">{t.emoji}</div>
            <div className="text-sm">{t.name}</div>
          </button>
        ))}
      </div>

      {team && (
        <div className="space-y-3">
          <p className="text-sm opacity-70">Draw me next to (optional):</p>
          <div className="flex flex-wrap justify-center gap-2">
            {team.players.map((p) => (
              <button
                key={p}
                onClick={() => setPlayer((cur) => (cur === p ? undefined : p))}
                className={`rounded-full border px-3 py-1 text-sm ${
                  player === p ? 'border-[var(--gold)] bg-white/5' : 'border-white/15'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button className="btn-gold" onClick={() => onConfirm({ team: team.name, player })}>
            Start the drawing →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Wire it into `app/page.tsx`** — replace the `vibe` placeholder block with:

```tsx
{state.step === 'vibe' && (
  <VibePicker onConfirm={(config) => advance({ config })} />
)}
```

Add the import: `import VibePicker from '@/components/VibePicker';`

- [ ] **Step 7: Run the suite and manually verify**

Run: `npm test` (all PASS), then `npm run dev` and confirm selecting a team reveals players and "Start the drawing" advances. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add lib/teams.ts lib/teams.test.ts components/VibePicker.tsx app/page.tsx
git commit -m "feat: World Cup team + player vibe picker"
```

---

### Task 8: ResultView — download + share

**Files:**
- Create: `lib/share.ts`
- Create: `components/ResultView.tsx`
- Modify: `app/page.tsx` (replace the `result` placeholder)
- Test: `lib/share.test.ts`

**Interfaces:**
- Produces:
  - `shareText(config: { team: string; player?: string }): string`
  - `<ResultView plan={DrawingPlan} config={{team,player?}} onRestart={() => void} />`

- [ ] **Step 1: Write the failing test `lib/share.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { shareText } from './share';

describe('shareText', () => {
  it('mentions the team', () => {
    expect(shareText({ team: 'Brazil' })).toContain('Brazil');
  });
  it('mentions the player when present', () => {
    expect(shareText({ team: 'Brazil', player: 'Neymar' })).toContain('Neymar');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- share`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/share.ts`**

```ts
export function shareText(config: { team: string; player?: string }): string {
  const withPlayer = config.player ? ` with ${config.player}` : '';
  return `I got drawn by DrawMyAI in ${config.team} colors${withPlayer}! 🎨⚽`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- share`
Expected: PASS, 2 tests.

- [ ] **Step 5: Implement `components/ResultView.tsx`**

```tsx
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
```

- [ ] **Step 6: Wire it into `app/page.tsx`** — replace the `result` placeholder with:

```tsx
{state.step === 'result' && state.plan && state.config && (
  <ResultView
    plan={state.plan}
    config={state.config}
    onRestart={() => setState(INITIAL_STATE)}
  />
)}
```

Add the import: `import ResultView from '@/components/ResultView';`

- [ ] **Step 7: Run the suite and manually verify the whole journey**

Run: `npm test` (all PASS), then `npm run dev` and walk Begin → photo → team → easel → result → Download/Share/Draw another. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add lib/share.ts lib/share.test.ts components/ResultView.tsx app/page.tsx
git commit -m "feat: result view with download + share"
```

---

### Task 9: Engine 1 — PortraitEngine interface + GenerationService + line-art tracing

Builds the server-side assembly of a real Drawing Plan, tested against a fake engine. No real network call yet (Task 11).

**Files:**
- Create: `lib/engine1/portraitEngine.ts`
- Create: `lib/engine1/lineart.ts`
- Create: `lib/engine1/generationService.ts`
- Test: `lib/engine1/generationService.test.ts`

**Interfaces:**
- Produces:
  - `type PortraitInput = { selfie: string; team: string; player?: string }`
  - `type PortraitOutput = { colorImage: string; lineArtImage: string; width: number; height: number }`
  - `interface PortraitEngine { generate(input: PortraitInput): Promise<PortraitOutput> }`
  - `traceToStrokePaths(pngDataUrl: string): Promise<StrokePath[]>` (uses `potrace`)
  - `buildPrompt(input: PortraitInput): string`
  - `generateDrawingPlan(input: PortraitInput, engine: PortraitEngine): Promise<DrawingPlan>`

- [ ] **Step 1: Install the tracer**

```bash
npm install potrace
```

- [ ] **Step 2: Create `lib/engine1/portraitEngine.ts`**

```ts
export interface PortraitInput {
  selfie: string; // data URL or remote URL of the captured/uploaded photo
  team: string;
  player?: string;
}

export interface PortraitOutput {
  colorImage: string;   // finished color portrait (URL or data URI)
  lineArtImage: string; // line-art / sketch version (URL or data URI)
  width: number;
  height: number;
}

export interface PortraitEngine {
  generate(input: PortraitInput): Promise<PortraitOutput>;
}

export function buildPrompt(input: PortraitInput): string {
  const withPlayer = input.player ? `, standing next to football star ${input.player}` : '';
  return (
    `Hand-drawn portrait of this person as a passionate ${input.team} football fan` +
    `${withPlayer}, wearing the ${input.team} kit, face paint and flag colors, ` +
    `warm pencil-and-ink illustration, World Cup energy, clean line art.`
  );
}
```

- [ ] **Step 3: Create `lib/engine1/lineart.ts`**

`potrace` traces a raster image into an SVG of filled paths; we extract each `d` attribute as a stroke. Centerline tracing is a future refinement noted in the spec.

```ts
import { trace } from 'potrace';
import type { StrokePath } from '@/lib/drawing/types';

/** Decode a data URL into a Buffer for potrace. */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Buffer.from(base64, 'base64');
}

export function extractPathData(svg: string): string[] {
  const matches = svg.matchAll(/<path[^>]*\sd="([^"]+)"/g);
  return Array.from(matches, (m) => m[1]);
}

export function traceToStrokePaths(pngDataUrl: string): Promise<StrokePath[]> {
  const buf = dataUrlToBuffer(pngDataUrl);
  return new Promise((resolve, reject) => {
    trace(buf, { turdSize: 40, threshold: 160 }, (err, svg) => {
      if (err) return reject(err);
      resolve(extractPathData(svg).map((d) => ({ d })));
    });
  });
}
```

- [ ] **Step 4: Write the failing test `lib/engine1/generationService.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { generateDrawingPlan } from './generationService';
import { buildPrompt, type PortraitEngine } from './portraitEngine';
import { extractPathData } from './lineart';

const fakeEngine: PortraitEngine = {
  async generate() {
    // 1x1 transparent png; potrace yields zero or more paths — fine for the test.
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    return { colorImage: 'color.png', lineArtImage: png, width: 400, height: 500 };
  },
};

describe('generationService', () => {
  it('builds a drawing plan from engine output', async () => {
    const plan = await generateDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(plan.width).toBe(400);
    expect(plan.colorImage).toBe('color.png');
    expect(Array.isArray(plan.strokePaths)).toBe(true);
    expect(plan.timing.accelerate).toBe(true);
  });

  it('buildPrompt includes team and player', () => {
    expect(buildPrompt({ selfie: 'x', team: 'Brazil', player: 'Neymar' })).toContain('Brazil');
    expect(buildPrompt({ selfie: 'x', team: 'Brazil', player: 'Neymar' })).toContain('Neymar');
  });

  it('extractPathData pulls d attributes from svg', () => {
    expect(extractPathData('<svg><path d="M0 0 L1 1"/></svg>')).toEqual(['M0 0 L1 1']);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- generationService`
Expected: FAIL — `generateDrawingPlan` not defined.

- [ ] **Step 6: Implement `lib/engine1/generationService.ts`**

```ts
import type { DrawingPlan } from '@/lib/drawing/types';
import { traceToStrokePaths } from './lineart';
import type { PortraitEngine, PortraitInput } from './portraitEngine';

export const DEFAULT_TIMING = { outlineMs: 18000, shadeMs: 5000, colorMs: 6000, accelerate: true };

export async function generateDrawingPlan(
  input: PortraitInput,
  engine: PortraitEngine,
): Promise<DrawingPlan> {
  const out = await engine.generate(input);
  const strokePaths = await traceToStrokePaths(out.lineArtImage);
  return {
    width: out.width,
    height: out.height,
    strokePaths,
    shadingLayer: out.lineArtImage,
    colorImage: out.colorImage,
    timing: DEFAULT_TIMING,
  };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- generationService`
Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add lib/engine1/ package.json package-lock.json
git commit -m "feat: Engine 1 generation service + line-art tracing (fake engine tested)"
```

---

### Task 10: `/api/generate` route + client wiring (mock vs real switch)

The route returns the fixture when no API key is configured (so the prototype always works), else assembles a real plan. The `preparing` step calls it.

**Files:**
- Create: `app/api/generate/route.ts`
- Modify: `app/page.tsx` (the `preparing` step calls the API)
- Test: `app/api/generate/route.test.ts`

**Interfaces:**
- Consumes: `generateDrawingPlan`, `WORLD_CUP_FIXTURE`, `PortraitInput`.
- Produces: `POST /api/generate` accepting `{ selfie, team, player? }` and returning a `DrawingPlan` as JSON. Exports `resolvePlan(input, opts)` for testing.

- [ ] **Step 1: Write the failing test `app/api/generate/route.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolvePlan } from './route';

describe('resolvePlan', () => {
  it('returns the fixture in mock mode', async () => {
    const plan = await resolvePlan({ selfie: 'x', team: 'Brazil' }, { mock: true });
    expect(plan.strokePaths.length).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- generate/route`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/api/generate/route.ts`**

```ts
import { NextResponse } from 'next/server';
import type { DrawingPlan } from '@/lib/drawing/types';
import { WORLD_CUP_FIXTURE } from '@/lib/drawing/fixtures';
import { generateDrawingPlan } from '@/lib/engine1/generationService';
import type { PortraitInput } from '@/lib/engine1/portraitEngine';
import { RealPortraitEngine } from '@/lib/engine1/realPortraitEngine';

export async function resolvePlan(
  input: PortraitInput,
  opts: { mock: boolean },
): Promise<DrawingPlan> {
  if (opts.mock) return WORLD_CUP_FIXTURE;
  return generateDrawingPlan(input, new RealPortraitEngine());
}

export async function POST(req: Request) {
  const input = (await req.json()) as PortraitInput;
  const mock = !process.env.PORTRAIT_API_URL;
  const plan = await resolvePlan(input, { mock });
  return NextResponse.json(plan);
}
```

> Note: `RealPortraitEngine` is created in Task 11. To keep this task green on its own, first add a stub file `lib/engine1/realPortraitEngine.ts`:
> ```ts
> import type { PortraitEngine, PortraitOutput } from './portraitEngine';
> export class RealPortraitEngine implements PortraitEngine {
>   async generate(): Promise<PortraitOutput> {
>     throw new Error('RealPortraitEngine not configured');
>   }
> }
> ```
> Task 11 replaces the stub body. The `mock` path never constructs/calls it, so the test stays green.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- generate/route`
Expected: PASS, 1 test.

- [ ] **Step 5: Wire the `preparing` step in `app/page.tsx`**

Replace the `preparing` block with a call to the API on entry:

```tsx
{state.step === 'preparing' && (
  <Preparing
    photo={state.photo!}
    config={state.config!}
    onReady={(plan) => advance({ plan })}
  />
)}
```

Add this component near the bottom of `app/page.tsx` (same file):

```tsx
import { useEffect } from 'react';
import type { DrawingPlan } from '@/lib/drawing/types';

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
```

- [ ] **Step 6: Run the suite and verify the mock end-to-end**

Run: `npm test` (all PASS), then `npm run dev` (no `PORTRAIT_API_URL` set → mock mode) and confirm the preparing step fetches and the easel draws. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add app/api/generate/ app/page.tsx lib/engine1/realPortraitEngine.ts
git commit -m "feat: /api/generate route with mock fixture + preparing step wiring"
```

---

### Task 11: RealPortraitEngine adapter (provider-backed)

Replaces the stub with a concrete REST call against a face-preserving image API. The adapter expects an env-configured endpoint that accepts `{ image, prompt }` and returns `{ colorImage, lineArtImage, width, height }`. Adjust the field names to the chosen provider's contract — this is the single provider-specific point in the codebase.

**Files:**
- Modify: `lib/engine1/realPortraitEngine.ts`
- Create: `.env.example`
- Test: `lib/engine1/realPortraitEngine.test.ts`

**Interfaces:**
- Consumes: `PortraitEngine`, `PortraitInput`, `PortraitOutput`, `buildPrompt`.
- Produces: `class RealPortraitEngine implements PortraitEngine` reading `PORTRAIT_API_URL` and `PORTRAIT_API_KEY`.

- [ ] **Step 1: Write the failing test `lib/engine1/realPortraitEngine.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealPortraitEngine } from './realPortraitEngine';

afterEach(() => vi.unstubAllGlobals());

describe('RealPortraitEngine', () => {
  it('posts the prompt and maps the response', async () => {
    process.env.PORTRAIT_API_URL = 'https://api.example.com/generate';
    process.env.PORTRAIT_API_KEY = 'secret';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ colorImage: 'c.png', lineArtImage: 'l.png', width: 400, height: 500 }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await new RealPortraitEngine().generate({ selfie: 'data:...', team: 'Brazil' });

    expect(out.colorImage).toBe('c.png');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(String(init?.body)).toContain('Brazil');
  });

  it('throws a clear error when not configured', async () => {
    delete process.env.PORTRAIT_API_URL;
    await expect(new RealPortraitEngine().generate({ selfie: 'x', team: 'Brazil' })).rejects.toThrow(
      /not configured/i,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- realPortraitEngine`
Expected: FAIL — current stub throws unconditionally / no mapping.

- [ ] **Step 3: Implement `lib/engine1/realPortraitEngine.ts`**

```ts
import { buildPrompt, type PortraitEngine, type PortraitInput, type PortraitOutput } from './portraitEngine';

export class RealPortraitEngine implements PortraitEngine {
  async generate(input: PortraitInput): Promise<PortraitOutput> {
    const url = process.env.PORTRAIT_API_URL;
    const key = process.env.PORTRAIT_API_KEY;
    if (!url) throw new Error('RealPortraitEngine not configured: set PORTRAIT_API_URL');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      // Provider-specific contract — adjust these field names to your image API.
      body: JSON.stringify({ image: input.selfie, prompt: buildPrompt(input) }),
    });

    if (!res.ok) throw new Error(`Portrait API error: ${res.status}`);
    const json = (await res.json()) as PortraitOutput;
    return {
      colorImage: json.colorImage,
      lineArtImage: json.lineArtImage,
      width: json.width,
      height: json.height,
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- realPortraitEngine`
Expected: PASS, 2 tests.

- [ ] **Step 5: Create `.env.example`**

```bash
# Leave unset to run the prototype in mock mode (uses the built-in fixture portrait).
# Set both to switch on the real face-preserving image API.
PORTRAIT_API_URL=
PORTRAIT_API_KEY=
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/engine1/realPortraitEngine.ts lib/engine1/realPortraitEngine.test.ts .env.example
git commit -m "feat: provider-backed RealPortraitEngine adapter (env-configured)"
```

---

### Task 12: Kiosk pass — fullscreen, camera-default, offline grace

**Files:**
- Create: `lib/kiosk.ts`
- Modify: `components/InputStep.tsx` (default to camera in kiosk mode)
- Modify: `app/page.tsx` (idle reset to start)
- Test: `lib/kiosk.test.ts`

**Interfaces:**
- Produces:
  - `isKiosk(search: string): boolean` — true when `?kiosk=1` is present.
  - `IDLE_RESET_MS: number`.

- [ ] **Step 1: Write the failing test `lib/kiosk.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { isKiosk, IDLE_RESET_MS } from './kiosk';

describe('kiosk', () => {
  it('detects the kiosk query flag', () => {
    expect(isKiosk('?kiosk=1')).toBe(true);
    expect(isKiosk('?foo=bar')).toBe(false);
    expect(isKiosk('')).toBe(false);
  });
  it('exposes an idle reset window', () => {
    expect(IDLE_RESET_MS).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- kiosk`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/kiosk.ts`**

```ts
export const IDLE_RESET_MS = 60_000;

export function isKiosk(search: string): boolean {
  return new URLSearchParams(search).get('kiosk') === '1';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- kiosk`
Expected: PASS, 2 tests.

- [ ] **Step 5: Default to camera in kiosk mode in `components/InputStep.tsx`**

Change the initial camera state so kiosk mode opens the camera immediately. Replace the `useState(false)` for `cameraOn` with:

```tsx
import { isKiosk } from '@/lib/kiosk';
// ...
const [cameraOn, setCameraOn] = useState(
  typeof window !== 'undefined' && isKiosk(window.location.search),
);
```

- [ ] **Step 6: Add an idle reset on the result screen in `app/page.tsx`**

Inside `Home`, add:

```tsx
import { isKiosk, IDLE_RESET_MS } from '@/lib/kiosk';
// ...
useEffect(() => {
  if (state.step !== 'result') return;
  if (typeof window === 'undefined' || !isKiosk(window.location.search)) return;
  const id = setTimeout(() => setState(INITIAL_STATE), IDLE_RESET_MS);
  return () => clearTimeout(id);
}, [state.step]);
```

(Add `useEffect` to the React import.)

- [ ] **Step 7: Run the suite and verify kiosk mode**

Run: `npm test` (all PASS), then `npm run dev` and open `http://localhost:3000/?kiosk=1`; confirm the input step opens the camera directly and the result screen resets to start after the idle window. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add lib/kiosk.ts lib/kiosk.test.ts components/InputStep.tsx app/page.tsx
git commit -m "feat: kiosk mode — camera default + idle reset"
```

---

## Self-Review

**Spec coverage:**
- §2 capture + upload → Task 6 ✓
- §2 light customization (team + player) → Task 7 ✓
- §2 authentic pencil draw-on / Gallery Easel → Tasks 2–5 ✓
- §2 shareable/downloadable portrait → Task 8 ✓
- §2 web + kiosk one codebase → Task 12 ✓
- §4 two engines + Drawing Plan handoff → Tasks 2 (plan type), 9 (Engine 1), 4 (Engine 2) ✓
- §5 components (InputStep, VibePicker, PreparingView, DrawingPerformance, ResultView, GenerationService, PortraitEngineAdapter) → Tasks 6,7,10,4,8,9,11 ✓
- §6 six-screen flow → Task 5 ✓
- §7 error handling (camera-denied → upload, no-face → retake, generation fail → retry) → Tasks 6, 10 ✓
- §8 Engine 2 tested against fixtures first; adapter mockable → Tasks 3–4, 9 ✓
- §9 build order → task order matches ✓
- §10 open questions (provider choice, line-art method) → Tasks 9, 11 keep the adapter swappable ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" steps; every code step shows complete code. The one forward reference (`RealPortraitEngine` in Task 10) is resolved with an explicit stub in Task 10 step 3, replaced in Task 11.

**Type consistency:** `DrawingPlan`, `RenderState`, `PortraitInput`/`PortraitOutput`, `PortraitEngine.generate`, `generateDrawingPlan`, `computeRenderState`, `traceToStrokePaths`, `nextStep`/`AppState` are defined once and consumed with matching signatures across tasks. The mock-vs-real boundary (`resolvePlan`) and the `{ team, player? }` config shape are consistent from Task 5 through Task 11.
