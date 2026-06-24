# Painting Engine Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Engine 2's color renderer with a true oil stroke-based painterly engine: the browser performs a finished, server-derived `OilStroke[]` onto an accumulating bitmap as visible coarse→fine brushwork, with the final canvas built 100% from strokes (no AI-photo reveal).

**Architecture:** Classic stroke-based rendering, Canvas 2D, strokes derived server-side. Built **decoupled-first**: M0 adds the v2 data contract + pacing scheduler (pure logic); M1 builds the browser renderer against a *static fixture plan* so the hand-painted look is nailed before any AI/derivation exists; M2–M3 add server derivation + face targeting; M4 polishes choreography; M5 switches the app over and deletes the v1 engine. **Every milestone is additive (new files/new names) until M5**, so the existing 39 tests stay green at all times.

**Tech Stack:** Next.js 16.2.9 (App Router) · React 19.2.4 · TypeScript (strict) · Vitest 4 (jsdom) · Canvas 2D · `jimp` (server image ops, already a dep) · `onnxruntime-node` + BlazeFace (new, M3 only).

**Spec:** `docs/superpowers/specs/2026-06-23-painting-engine-redesign-design.md` (authoritative; this plan implements it).

## Global Constraints

- **Honor the nine locked decisions (spec §1)** in every task. The load-bearing ones:
  - Final canvas = **100% strokes**; **never** fade in / `drawImage` the `colorImage`.
  - `photoGlaze` defaults to **0**; emergency dial only.
  - Souvenir = **painted-canvas `toBlob()` snapshot**, never the AI image.
  - Detail-map **and** face detection live **server-side**; the browser is a dumb performer.
  - Pacing is a **shaped curve with a fixed reserved Layer-4 slow tail**, never monotonic accelerate.
  - **Accumulating bitmap**: paint each stroke once onto a persistent canvas; never redraw all strokes per frame.
- **Do NOT scaffold a new app.** Modify the existing codebase on `master`. The full app already exists (39 passing tests, clean build).
- **Additive until M5.** Do not edit `lib/drawing/types.ts` (v1 fields), `performanceScheduler.ts`, `fixtures.ts`, `components/DrawingPerformance.tsx`, or `generationService.ts` before M5. New engine = new files (`oil*`). The v1 engine keeps working until M5 swaps it out.
- **Tests:** run with `npm run test` (= `vitest run`). All existing tests must stay green after every task.
- **TS strict**, no `any` in new code; image-provider keys stay server-side only.
- **Before writing any Next.js code** (routes, components), consult `node_modules/next/dist/docs/` per `AGENTS.md` — this Next.js has breaking changes vs. training data.
- **Determinism:** any randomness in server derivation or fixtures must be seeded so plans/tests are reproducible.

---

## File map (new files unless noted)

| Milestone | File | Responsibility |
|---|---|---|
| M0 | `lib/drawing/oilTypes.ts` | v2 contract: `OilStroke`, `OilDrawingPlan`, `OilTiming`, `OilPhase`, `Tool`, `OilRenderState` |
| M0 | `lib/drawing/oilScheduler.ts` (+ `.test.ts`) | `computeOilState(plan, elapsedMs)` — shaped pacing + reserved Layer-4 tail |
| M1 | `lib/drawing/oilBrush.ts` (+ `.test.ts`) | `paintOilStroke(ctx, s)`, `paintGround(ctx, w, h)`, `bristleCount(s)` — render one oil stroke / texture |
| M1 | `lib/drawing/oilFixture.ts` (+ `.test.ts`) | `OIL_FIXTURE: OilDrawingPlan` — deterministic static v2 plan (no AI) |
| M1 | `components/OilPerformance.tsx` (+ `.test.tsx`) | The performer: 3-layer stack, accumulating bitmap, hand/tool, `onDone` |
| M1 | `app/dev/oil/page.tsx` | Visual dev harness: renders `OilPerformance` w/ fixture + a `toBlob` download button |
| M2 | `lib/engine1/oilStrokes.ts` (+ `.test.ts`) | `deriveOilStrokesFromBuffer(buf, w, h, faceBox?)` — orientation field, layers, density, ordering |
| M2 | `lib/engine1/oilGenerationService.ts` (+ `.test.ts`) | `generateOilDrawingPlan(input, engine)` — assembles `OilDrawingPlan` |
| M3 | `lib/engine1/faceBox.ts` (+ `.test.ts`) | `detectFaceBox(buf) → { box, eyesMouth? } | null` (BlazeFace; non-blocking) |
| M4 | (tuning in M1/M2 files) | Pacing/param tuning; tool-swap polish |
| M5 | edits: `types.ts`, `app/api/generate/route.ts`, `app/page.tsx`/`EaselScreen.tsx`, `ResultView.tsx`; deletes: `brushStrokes.ts`, v1 `derive` shading, `DrawingPerformance.tsx`, `performanceScheduler.ts`, v1 fixture parts | Switch app to oil engine; export painted snapshot; retire v1; rename `OilDrawingPlan`→`DrawingPlan` |

---

# Milestone M0 — v2 contract + pacing scheduler (pure logic)

No UI, no AI. Produces the data types and the pacing math, fully unit-tested.

### Task 1: v2 data contract (`oilTypes.ts`)

**Files:**
- Create: `lib/drawing/oilTypes.ts`
- (Reuses `StrokePath` from `lib/drawing/types.ts` — do not modify that file)

**Interfaces:**
- Produces: `OilStroke`, `OilTiming`, `OilDrawingPlan`, `OilPhase`, `Tool`, `OilRenderState` (signatures below). All later tasks consume these.

- [ ] **Step 1: Write the file** (types only — no test needed for pure type declarations; it's validated by compiling consumers)

```ts
import type { StrokePath } from './types';

/** One oil brush stroke, derived server-side, performed by the browser. */
export interface OilStroke {
  x: number;        // centre, display coords
  y: number;
  angle: number;    // radians — along the form (perpendicular to image gradient)
  length: number;   // px
  width: number;    // brush diameter px
  color: string;    // '#rrggbb'
  layer: number;    // 0 block-in … 5 accent. Drives order + timing + bristle count.
}

export interface OilTiming {
  outlineMs: number;   // Phase 1 sketch (reused SVG line draw)
  blockInMs: number;   // Phase 2: layer 0
  refineMs: number;    // Phase 3: layers 1..4 (with reserved Layer-4 tail)
  accentMs: number;    // Phase 4: layer 5
  photoGlaze: number;  // 0..1, DEFAULT 0 — emergency only
}

export interface OilDrawingPlan {
  width: number;
  height: number;
  strokePaths: StrokePath[];  // Phase-1 line sketch (reused)
  oilStrokes: OilStroke[];    // MUST be ordered by `layer` ascending
  colorImage: string;         // glaze source only; never painted unless photoGlaze > 0
  timing: OilTiming;
}

export type OilPhase = 'sketch' | 'blockIn' | 'refine' | 'accent' | 'done';
export type Tool = 'pencil' | 'brushBig' | 'brushMid' | 'brushFine' | 'pen';

export interface OilRenderState {
  phase: OilPhase;
  sketchFractions: number[];   // index-aligned with strokePaths, 0..1
  activeSketch: number | null; // sketch stroke under the hand
  oilDrawn: number;            // paint strokes [0, oilDrawn) onto the bitmap (monotonic)
  activeOil: number | null;    // oil stroke under the hand
  tool: Tool | null;           // tool the hand currently holds
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/drawing/oilTypes.ts
git commit -m "feat(oil): v2 DrawingPlan contract (OilStroke, OilDrawingPlan)"
```

---

### Task 2: pacing scheduler (`oilScheduler.ts`)

**Files:**
- Create: `lib/drawing/oilScheduler.ts`
- Test: `lib/drawing/oilScheduler.test.ts`

**Interfaces:**
- Consumes: `OilDrawingPlan`, `OilRenderState`, `Tool` from `oilTypes.ts`.
- Produces: `computeOilState(plan: OilDrawingPlan, elapsedMs: number): OilRenderState`; `LAYER4_RESERVE_MS` constant.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeOilState, LAYER4_RESERVE_MS } from './oilScheduler';
import type { OilDrawingPlan, OilStroke } from './oilTypes';

const mk = (layer: number): OilStroke => ({ x: 0, y: 0, angle: 0, length: 4, width: 6, color: '#888888', layer });

// counts: layer0=2, layer1=2, layer2=0, layer3=0, layer4=2, layer5=2
const oilStrokes: OilStroke[] = [
  mk(0), mk(0), mk(1), mk(1), mk(4), mk(4), mk(5), mk(5),
];
const plan: OilDrawingPlan = {
  width: 400, height: 500,
  strokePaths: [{ d: 'M0 0 L10 0' }, { d: 'M0 10 L10 10' }],
  oilStrokes,
  colorImage: 'color.png',
  timing: { outlineMs: 1000, blockInMs: 1000, refineMs: 6000, accentMs: 1000, photoGlaze: 0 },
};

describe('computeOilState', () => {
  it('starts in sketch holding a pencil, nothing painted', () => {
    const s = computeOilState(plan, 0);
    expect(s.phase).toBe('sketch');
    expect(s.oilDrawn).toBe(0);
    expect(s.tool).toBe('pencil');
    expect(s.sketchFractions).toEqual([0, 0]);
    expect(s.activeSketch).toBe(0);
  });

  it('draws sketch strokes sequentially', () => {
    const s = computeOilState(plan, 750); // slice = 500ms
    expect(s.sketchFractions[0]).toBe(1);
    expect(s.sketchFractions[1]).toBeCloseTo(0.5);
    expect(s.activeSketch).toBe(1);
  });

  it('block-in reveals layer-0 strokes with the big brush', () => {
    const s = computeOilState(plan, 1500); // halfway through blockIn (1000..2000), c0=2
    expect(s.phase).toBe('blockIn');
    expect(s.oilDrawn).toBe(1);
    expect(s.tool).toBe('brushBig');
  });

  it('reserves a FIXED Layer-4 tail: at the end of the bulk window, layer-4 has not started', () => {
    // refine spans 2000..8000 (6000ms). bulk = layers 1..3 (count 2), reserve = LAYER4_RESERVE_MS.
    const tBulkEnd = 2000 + (6000 - LAYER4_RESERVE_MS) - 1;
    const s = computeOilState(plan, tBulkEnd);
    expect(s.phase).toBe('refine');
    expect(s.oilDrawn).toBe(2 /*c0*/ + 2 /*c1*/); // bulk done, layer-4 not yet
  });

  it('paints the eyes/mouth (layer 4) during the reserved tail', () => {
    const tInTail = 2000 + (6000 - LAYER4_RESERVE_MS) + LAYER4_RESERVE_MS / 2;
    const s = computeOilState(plan, tInTail);
    expect(s.oilDrawn).toBe(2 + 2 + 1); // one of two layer-4 strokes
    expect(s.tool).toBe('brushFine');
  });

  it('the Layer-4 tail length is independent of bulk stroke count (stadium case)', () => {
    const heavy: OilDrawingPlan = { ...plan, oilStrokes: [mk(0), ...Array.from({ length: 200 }, () => mk(1)), mk(4), mk(4)] };
    const tInTail = 2000 + (6000 - LAYER4_RESERVE_MS) + LAYER4_RESERVE_MS / 2;
    const s = computeOilState(heavy, tInTail);
    // half of the two layer-4 strokes painted, regardless of the 200 bulk strokes
    expect(s.oilDrawn).toBe(1 /*c0*/ + 200 /*bulk*/ + 1 /*half of layer4*/);
  });

  it('accent reveals layer 5 with the pen', () => {
    const s = computeOilState(plan, 8500); // accent spans 8000..9000
    expect(s.phase).toBe('accent');
    expect(s.tool).toBe('pen');
  });

  it('oilDrawn is monotonic non-decreasing', () => {
    let prev = -1;
    for (let t = 0; t <= 9000; t += 100) {
      const d = computeOilState(plan, t).oilDrawn;
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('finishes done: everything painted, hand lifted (tool null)', () => {
    const s = computeOilState(plan, 99999);
    expect(s.phase).toBe('done');
    expect(s.oilDrawn).toBe(oilStrokes.length);
    expect(s.activeOil).toBeNull();
    expect(s.tool).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/drawing/oilScheduler.test.ts`
Expected: FAIL — `computeOilState`/`LAYER4_RESERVE_MS` not exported.

- [ ] **Step 3: Write the implementation**

```ts
import type { OilDrawingPlan, OilRenderState, Tool } from './oilTypes';

/** Fixed slow tail reserved at the end of the refine phase for the eyes/mouth (layer 4). */
export const LAYER4_RESERVE_MS = 3000;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const fill = (n: number, v: number) => new Array(Math.max(0, n)).fill(v);

/** Each of `n` items fills over its own equal slice of `duration`. */
function sequentialFill(n: number, elapsed: number, duration: number): { fractions: number[]; active: number | null } {
  if (n <= 0) return { fractions: [], active: null };
  const slice = duration / n;
  const fractions = Array.from({ length: n }, (_, i) => clamp01((elapsed - i * slice) / slice));
  const active = Math.min(n - 1, Math.max(0, Math.floor(elapsed / slice)));
  return { fractions, active };
}

function toolForLayer(layer: number): Tool {
  if (layer <= 0) return 'brushBig';
  if (layer === 1) return 'brushMid';
  if (layer <= 4) return 'brushFine';
  return 'pen';
}

export function computeOilState(plan: OilDrawingPlan, elapsedMs: number): OilRenderState {
  const { strokePaths, oilStrokes, timing } = plan;
  const { outlineMs, blockInMs, refineMs, accentMs } = timing;
  const n = strokePaths.length;
  const T = oilStrokes.length;
  const total = outlineMs + blockInMs + refineMs + accentMs;
  const t = Math.max(0, elapsedMs);

  const counts = [0, 1, 2, 3, 4, 5].map((L) => oilStrokes.filter((s) => s.layer === L).length);

  const settle = (phase: OilRenderState['phase'], sketchFractions: number[], drawnRaw: number): OilRenderState => {
    const oilDrawn = Math.min(T, Math.max(0, Math.floor(drawnRaw)));
    const activeOil = oilDrawn > 0 && oilDrawn <= T ? oilDrawn - 1 : null;
    const tool = activeOil != null && oilStrokes[activeOil] ? toolForLayer(oilStrokes[activeOil].layer) : null;
    return { phase, sketchFractions, activeSketch: null, oilDrawn, activeOil, tool };
  };

  if (t >= total) {
    return { phase: 'done', sketchFractions: fill(n, 1), activeSketch: null, oilDrawn: T, activeOil: null, tool: null };
  }

  // Phase 1 — sketch
  if (t < outlineMs) {
    const { fractions, active } = sequentialFill(n, t, outlineMs);
    return { phase: 'sketch', sketchFractions: fractions, activeSketch: active, oilDrawn: 0, activeOil: null, tool: 'pencil' };
  }
  const sketchDone = fill(n, 1);

  // Phase 2 — block-in (layer 0)
  if (t < outlineMs + blockInMs) {
    const p = blockInMs > 0 ? (t - outlineMs) / blockInMs : 1;
    return settle('blockIn', sketchDone, clamp01(p) * counts[0]);
  }

  // Phase 3 — refine (layers 1..3 as bulk, then fixed reserved tail for layer 4)
  const refineStart = outlineMs + blockInMs;
  if (t < refineStart + refineMs) {
    const tr = t - refineStart;
    const bulk = counts[1] + counts[2] + counts[3];
    const c4 = counts[4];
    const reserve = c4 > 0 ? Math.min(refineMs * 0.4, LAYER4_RESERVE_MS) : 0;
    const bulkMs = Math.max(1, refineMs - reserve);
    let inRefine: number;
    if (tr <= bulkMs) {
      inRefine = clamp01(tr / bulkMs) * bulk;
    } else {
      const p4 = reserve > 0 ? clamp01((tr - bulkMs) / reserve) : 1;
      inRefine = bulk + p4 * c4;
    }
    return settle('refine', sketchDone, counts[0] + inRefine);
  }

  // Phase 4 — accent (layer 5)
  const accentStart = refineStart + refineMs;
  const before = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
  const p5 = accentMs > 0 ? clamp01((t - accentStart) / accentMs) : 1;
  return settle('accent', sketchDone, before + p5 * counts[5]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/drawing/oilScheduler.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full suite (nothing regressed)**

Run: `npm run test`
Expected: all prior 39 tests + the new ones pass.

- [ ] **Step 6: Commit**

```bash
git add lib/drawing/oilScheduler.ts lib/drawing/oilScheduler.test.ts
git commit -m "feat(oil): shaped pacing scheduler with fixed Layer-4 reserved tail"
```

---

# Milestone M1 — Engine 2 renderer on a static fixture (THE LOOK, decoupled)

The riskiest piece, built with zero AI dependency. Goal: open `/dev/oil` and watch a believable oil portrait paint itself coarse→fine onto an accumulating bitmap, then download the painted snapshot.

### Task 3: oil brush rendering (`oilBrush.ts`)

**Files:**
- Create: `lib/drawing/oilBrush.ts`
- Test: `lib/drawing/oilBrush.test.ts`

**Interfaces:**
- Consumes: `OilStroke` from `oilTypes.ts`.
- Produces: `bristleCount(s: OilStroke): number`; `paintOilStroke(ctx: CanvasRenderingContext2D, s: OilStroke): void`; `paintGround(ctx: CanvasRenderingContext2D, w: number, h: number): void`.

- [ ] **Step 1: Write the failing test** (a fake 2D context records calls — no real canvas needed)

```ts
import { describe, it, expect } from 'vitest';
import { bristleCount, paintOilStroke, paintGround } from './oilBrush';
import type { OilStroke } from './oilTypes';

function fakeCtx() {
  const calls = { stroke: 0, fill: 0, moveTo: 0, lineTo: 0, beginPath: 0 };
  return {
    calls,
    globalAlpha: 1, lineWidth: 1, lineCap: '', strokeStyle: '', fillStyle: '', globalCompositeOperation: '',
    beginPath() { calls.beginPath++; }, moveTo() { calls.moveTo++; }, lineTo() { calls.lineTo++; },
    stroke() { calls.stroke++; }, fill() { calls.fill++; }, fillRect() {},
  } as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

const stroke = (over: Partial<OilStroke> = {}): OilStroke => ({ x: 50, y: 50, angle: 0.3, length: 12, width: 18, color: '#cc4422', layer: 0, ...over });

describe('oilBrush', () => {
  it('big early-layer brush has many bristles, fine late-layer few', () => {
    expect(bristleCount(stroke({ width: 24, layer: 0 }))).toBeGreaterThan(3);
    expect(bristleCount(stroke({ width: 4, layer: 4 }))).toBe(1);
  });

  it('paints one stroke as multiple bristle sub-lines + a highlight ridge, without throwing', () => {
    const ctx = fakeCtx() as ReturnType<typeof fakeCtx>;
    const s = stroke({ width: 24, layer: 0 });
    paintOilStroke(ctx, s);
    // one stroke() per bristle, plus the highlight ridge
    expect(ctx.calls.stroke).toBe(bristleCount(s) + 1);
    expect(ctx.calls.lineTo).toBeGreaterThan(0);
    expect(ctx.globalAlpha).toBe(1); // alpha restored after painting
  });

  it('lays a toned ground (does not throw, sets a fill)', () => {
    const ctx = fakeCtx();
    expect(() => paintGround(ctx, 100, 120)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/drawing/oilBrush.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write the implementation** (ported from the validated companion demo)

```ts
import type { OilStroke } from './oilTypes';

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function parseHex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [136, 136, 136];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgb = (r: number, g: number, b: number) => `rgb(${r},${g},${b})`;
const mix = (c: number, t: number, a: number) => clamp8(c + (t - c) * a);

/** Bristle tracks: many for fat early brushes, 1–3 for fine late layers. */
export function bristleCount(s: OilStroke): number {
  const base = Math.round(s.width / 3);
  if (s.layer >= 4) return 1;
  if (s.layer >= 2) return Math.max(1, Math.min(base, 3));
  return Math.max(2, base);
}

export function paintOilStroke(ctx: CanvasRenderingContext2D, s: OilStroke): void {
  const [r, g, b] = parseHex(s.color);
  const dx = Math.cos(s.angle), dy = Math.sin(s.angle);
  const n = bristleCount(s);
  const half = s.length / 2;
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const u = n === 1 ? 0 : k / (n - 1) - 0.5;        // -0.5..0.5 across the brush
    const off = u * s.width;
    const ox = -dy * off, oy = dx * off;
    const shadeA = Math.abs(u) * 0.6;                  // light→dark furrows
    const tint = u > 0 ? 255 : 0;
    ctx.strokeStyle = rgb(mix(r, tint, shadeA), mix(g, tint, shadeA), mix(b, tint, shadeA));
    ctx.lineWidth = Math.max(1, (s.width / n) * 1.3);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(s.x - dx * half + ox, s.y - dy * half + oy);
    ctx.lineTo(s.x + dx * half + ox, s.y + dy * half + oy);
    ctx.stroke();
  }
  // Impasto highlight ridge.
  ctx.strokeStyle = rgb(mix(r, 255, 0.45), mix(g, 255, 0.45), mix(b, 255, 0.45));
  ctx.lineWidth = Math.max(0.8, s.width / 4);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(s.x - dx * half * 0.4, s.y - dy * half * 0.4);
  ctx.lineTo(s.x + dx * half * 0.4, s.y + dy * half * 0.4);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Toned canvas ground + faint weave, drawn once under the painting. */
export function paintGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#c9bfae';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#7d705c';
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
  for (let j = 0; j < h; j += 4) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/drawing/oilBrush.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/drawing/oilBrush.ts lib/drawing/oilBrush.test.ts
git commit -m "feat(oil): bristle stroke + canvas-ground renderer"
```

---

### Task 4: static fixture v2 plan (`oilFixture.ts`)

**Files:**
- Create: `lib/drawing/oilFixture.ts`
- Test: `lib/drawing/oilFixture.test.ts`

**Interfaces:**
- Consumes: `OilDrawingPlan`, `OilStroke` from `oilTypes.ts`.
- Produces: `OIL_FIXTURE: OilDrawingPlan` (deterministic; oilStrokes ordered by layer ascending). Used by Tasks 5–6 and as the M1 visual target.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { OIL_FIXTURE } from './oilFixture';

describe('OIL_FIXTURE', () => {
  it('has strokes spanning coarse→fine layers, ordered by layer ascending', () => {
    expect(OIL_FIXTURE.oilStrokes.length).toBeGreaterThan(100);
    const layers = OIL_FIXTURE.oilStrokes.map((s) => s.layer);
    for (let i = 1; i < layers.length; i++) expect(layers[i]).toBeGreaterThanOrEqual(layers[i - 1]);
    expect(new Set(layers)).toContain(0); // block-in present
    expect(Math.max(...layers)).toBeGreaterThanOrEqual(4); // eyes/mouth present
  });

  it('uses the v2 timing shape with photoGlaze defaulting to 0', () => {
    expect(OIL_FIXTURE.timing.photoGlaze).toBe(0);
    expect(OIL_FIXTURE.timing.blockInMs).toBeGreaterThan(0);
    expect(OIL_FIXTURE.timing.refineMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/drawing/oilFixture.test.ts`
Expected: FAIL — `OIL_FIXTURE` missing.

- [ ] **Step 3: Write the implementation** (deterministic generator — a simple WC-style face/jersey; no `Math.random`)

```ts
import type { OilDrawingPlan, OilStroke } from './oilTypes';

const W = 400;
const H = 500;

const svgDataUri = (svg: string) => 'data:image/svg+xml,' + encodeURIComponent(svg);

// A deterministic pseudo-random in [0,1) from an integer seed (so the fixture is stable).
const rnd = (i: number) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

// Colour zones of the synthetic portrait, returned for a sampled (x,y).
function zoneColor(x: number, y: number): string {
  if (y > 330) return '#d4202a';                       // jersey (red)
  if (x > 120 && x < 280 && y > 110 && y < 300) return '#f1c79b'; // face (skin)
  return '#0b3d91';                                    // backdrop (blue)
}
// Crude "form" angle so block-in strokes wrap rather than all run flat.
const formAngle = (x: number) => -0.4 + (x / W) * 0.8;

function gridLayer(layer: number, step: number, width: number, length: number, gate: (x: number, y: number) => boolean): OilStroke[] {
  const out: OilStroke[] = [];
  let i = layer * 1000;
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      if (!gate(x, y)) continue;
      const jx = (rnd(i++) - 0.5) * step * 0.6;
      const jy = (rnd(i++) - 0.5) * step * 0.6;
      out.push({ x: x + jx, y: y + jy, angle: formAngle(x), length, width, color: zoneColor(x, y), layer });
    }
  }
  return out;
}

const inFace = (x: number, y: number) => x > 120 && x < 280 && y > 110 && y < 300;
const inEyesMouth = (x: number, y: number) => (y > 185 && y < 215) || (y > 255 && y < 280);

function buildStrokes(): OilStroke[] {
  return [
    ...gridLayer(0, 34, 30, 30, () => true),                 // block-in everywhere (big)
    ...gridLayer(1, 22, 18, 20, () => true),                 // forms (medium)
    ...gridLayer(2, 14, 10, 12, (x, y) => inFace(x, y) || y > 330), // detail on face + jersey
    ...gridLayer(3, 9, 6, 8, (x, y) => inFace(x, y)),         // fine on face
    ...gridLayer(4, 5, 4, 5, inEyesMouth),                   // DEDICATED eyes/mouth pass
    // accents: dark strokes around feature lines (layer 5)
    ...gridLayer(5, 7, 5, 7, (x, y) => inEyesMouth(x, y)).map((s) => ({ ...s, color: '#241c16' })),
  ];
}

const colorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0b3d91"/>
  <path d="M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z" fill="#f1c79b"/>
  <path d="M110 330 L160 380 L200 360 L240 380 L290 330 L290 500 L110 500 Z" fill="#d4202a"/>
</svg>`;

const STROKE_PATHS = [
  { d: 'M120 170 C120 100 280 100 280 170 C280 250 240 300 200 300 C160 300 120 250 120 170 Z' },
  { d: 'M160 200 a12 8 0 1 0 0.1 0 Z' },
  { d: 'M230 200 a12 8 0 1 0 0.1 0 Z' },
  { d: 'M170 265 q30 22 60 0' },
];

export const OIL_FIXTURE: OilDrawingPlan = {
  width: W,
  height: H,
  strokePaths: STROKE_PATHS,
  oilStrokes: buildStrokes(),
  colorImage: svgDataUri(colorSvg),
  timing: { outlineMs: 3000, blockInMs: 5000, refineMs: 11000, accentMs: 3000, photoGlaze: 0 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/drawing/oilFixture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/drawing/oilFixture.ts lib/drawing/oilFixture.test.ts
git commit -m "feat(oil): deterministic static fixture v2 plan for the renderer"
```

---

### Task 5: the performer component (`OilPerformance.tsx`)

**Files:**
- Create: `components/OilPerformance.tsx`
- Test: `components/OilPerformance.test.tsx`

**Interfaces:**
- Consumes: `OilDrawingPlan` (`oilTypes.ts`), `computeOilState` (`oilScheduler.ts`), `paintOilStroke`/`paintGround` (`oilBrush.ts`).
- Produces: `default function OilPerformance({ plan, onDone }: { plan: OilDrawingPlan; onDone: () => void })`. Exposes the painting `<canvas>` (for the harness to snapshot).

Key rules baked in:
- **Three sibling layers:** `<svg>` sketch (bottom), `<canvas>` painting (middle, the souvenir), `<img>` hand+tool (top). The hand is NEVER drawn into the canvas.
- **Accumulating bitmap:** keep a `cursorRef`; each frame paint strokes `[cursor, oilDrawn)` then set `cursor = oilDrawn`. Call `paintGround` once at start (and if `oilDrawn < cursor`, e.g. a remount, reset ground + cursor).
- **No `colorImage` painting** (glaze omitted in M1; `photoGlaze` stays 0).
- Hand lifts (opacity 0) at `phase === 'done'`, then `onDone()` fires once.
- Guard a null 2D context (jsdom).

- [ ] **Step 1: Write the failing test** (mirrors `DrawingPerformance.test.tsx` — structure + no-throw)

```tsx
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import OilPerformance from './OilPerformance';
import { OIL_FIXTURE } from '@/lib/drawing/oilFixture';

beforeAll(() => {
  // @ts-expect-error test stub
  SVGElement.prototype.getTotalLength = () => 100;
  // @ts-expect-error test stub
  SVGElement.prototype.getPointAtLength = () => ({ x: 0, y: 0 });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

describe('OilPerformance', () => {
  it('renders one sketch path per strokePath, a painting canvas, and a hand layer', () => {
    const { container } = render(<OilPerformance plan={OIL_FIXTURE} onDone={() => {}} />);
    expect(container.querySelectorAll('path').length).toBe(OIL_FIXTURE.strokePaths.length);
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(container.querySelectorAll('img').length).toBe(1); // hand only — NO colorImage <img>
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/OilPerformance.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Read the Next/React client-component guidance, then implement**

First: skim `node_modules/next/dist/docs/` for client-component/`'use client'` notes (per AGENTS.md). Then create `components/OilPerformance.tsx`:

```tsx
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
```

> Note: M1 reuses the single `/hand.svg` for all tools (distinct tool sprites are M4 polish). The `TOOL_SCALE` swap already makes the tool visibly grow/shrink per phase, satisfying "visible tool change" minimally.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/OilPerformance.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: all green (39 prior + new).

- [ ] **Step 6: Commit**

```bash
git add components/OilPerformance.tsx components/OilPerformance.test.tsx
git commit -m "feat(oil): OilPerformance — accumulating-bitmap performer with hand/tool"
```

---

### Task 6: visual dev harness (`/dev/oil`) + manual look review

**Files:**
- Create: `app/dev/oil/page.tsx`

**Interfaces:**
- Consumes: `OilPerformance`, `OIL_FIXTURE`.

- [ ] **Step 1: Read the App-Router page guidance, then create the harness page**

First skim `node_modules/next/dist/docs/` for App-Router page conventions. Then:

```tsx
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
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build`
Expected: compiles; `/dev/oil` appears in the route list. (Also `npm run test` stays green.)

- [ ] **Step 3: Manual look review (the real M1 gate)**

Run: `npm run dev`, open `http://localhost:3000/dev/oil`.
Confirm by eye:
1. Sketch lines draw first, then big strokes block in colour, then progressively smaller strokes, then dark accents.
2. Strokes show bristle texture on a toned canvas ground (not flat fills).
3. The eyes/mouth visibly tighten last (the slow Layer-4 beat).
4. The hand rides strokes and grows/shrinks with the tool; it lifts at the end.
5. "Download painted snapshot" saves the **painted** image with **no hand** in it.
6. No flat AI image ever appears.

This step is a human checkpoint — iterate on `oilBrush.ts`/`oilFixture.ts` constants until the look reads as hand-painted before proceeding. (Look-tuning has no unit test by design.)

- [ ] **Step 4: Commit**

```bash
git add app/dev/oil/page.tsx
git commit -m "feat(oil): /dev/oil visual harness + painted-snapshot download"
```

**M1 EXIT CRITERIA:** `/dev/oil` shows a believable oil portrait painting itself coarse→fine on an accumulating bitmap, the snapshot downloads cleanly (no hand, no flat image), and `npm run test` + `npm run build` are green. The look is now de-risked, fully decoupled from AI.

---

# Milestones M2–M5 — scoped task outline

> **Why these are outlined, not micro-stepped yet:** their concrete code (gradient thresholds, BlazeFace's exact Node API surface, final pacing constants) should be pinned against M1's *real* visual output and the real BlazeFace package, not guessed now — guessing would bake in speculative numbers that M1 tuning will overturn (YAGNI). Each task below is concrete in files/interfaces/tests; expand to full bite-sized TDD steps (like M0–M1) at the start of that milestone. Every task stays **additive** until M5.

### M2 — server-side stroke derivation  *(EXPANDED 2026-06-24, pinned to M1 reality)*

> **Expansion notes (reality-pinned against the shipped M0/M1 code):**
> - **jimp:** `jimp@0.14.0` is installed (used by `brushStrokes.ts`/`lineart.ts`) but was **not** declared in `package.json`. M2-T1 Step 0 declares it explicitly (per decision 2026-06-24). API used: `import Jimp from 'jimp'`, `await Jimp.read(buf)`, `img.clone()`, `img.resize(w,h)`, `img.greyscale()`, `img.getPixelColor(x,y): number`, `Jimp.intToRGBA(int) → {r,g,b,a}`, `img.bitmap.{width,height}`. Build synthetic test images with `await Jimp.create(w,h)` (or `new Jimp(w,h,hexInt)`), `img.setPixelColor(Jimp.rgbaToInt(r,g,b,255), x, y)`, `await img.getBufferAsync(Jimp.MIME_PNG)`.
> - **Reused v1 helpers (verbatim signatures):** `loadImageBuffer(src: string): Promise<Buffer>` (`./imageSource`); `deriveLineArtFromBuffer(buf: Buffer): Promise<string>` (`./derive`, returns a line-art data URI); `traceToStrokePaths(src: string): Promise<StrokePath[]>` (`./lineart`); `PortraitEngine.generate(input): Promise<PortraitOutput>` with `PortraitOutput = { colorImage: string; width: number; height: number }` and `PortraitInput = { selfie: string; team: string; player?: string }` (`./portraitEngine`).
> - **Load-bearing M1 contract:** the scheduler advances `oilDrawn` as an **index into `oilStrokes`** and filters per-layer counts, so the array MUST be **strictly layer-ascending and contiguous** (all layer 0, then 1, 2, 3, then 4, then 5). Layers 1–3 are the refine "bulk", layer 4 is the reserved-tail eyes/mouth pass, layer 5 is the accents. `toolForLayer` fixes meanings (0 big, 1 mid, 2–4 fine, 5 pen). Strokes are in **display coords** (0..dispW, 0..dispH).
> - **Per-layer params matched to the validated M1 fixture look** (`oilFixture.ts`): `LAYER_WIDTH = [30,18,10,6,4,5]`, `LAYER_LENGTH = [30,20,12,8,5,7]`, grid `LAYER_STEP = [34,22,14,9,5,7]` (display px). Seeded jitter `rnd(i)=frac(sin(i*12.9898)*43758.5453)` (same as the fixture) for determinism. These are starting values; final tuning is M4.
> - **faceBox seam:** `FaceBox = { box: Rect; eyesMouth?: Rect }` in **display coords**, type defined/exported by `oilStrokes.ts`. M2 tests it with a **mock** object; the real BlazeFace detector (which must scale its output to display coords) is M3. The `faceBox` param is accepted from T2 but only used from T3 (box boost) / T4 (eyes/mouth).
> - **Baseline note:** baseline is **63 green** at M1 end (HEAD `0fb417d`); each task is additive and raises the count. Gate every task: all prior tests stay green + new tests pass; `npx tsc --noEmit` shows only the 4 known pre-existing errors in `realPortraitEngine.test.ts` (no new); independent review; **stop for review after each task.**

---

#### Task 7: Orientation field (`orientationField.ts`)

**Files:**
- Modify: `package.json` (declare jimp)
- Create: `lib/engine1/orientationField.ts`
- Test: `lib/engine1/orientationField.test.ts`

**Interfaces:**
- Consumes: jimp 0.14 (image decode).
- Produces: `interface OrientationField { cols: number; rows: number; maxMagnitude: number; angleAt(dispX, dispY, dispW, dispH): number; magnitudeAt(dispX, dispY, dispW, dispH): number }`; `buildOrientationField(buf: Buffer, cols?: number): Promise<OrientationField>`. Consumed by Task 8 (`oilStrokes.ts`).

- [ ] **Step 0: Declare jimp** in `package.json` `dependencies` (already installed at this version, this just makes it explicit):

```json
    "jimp": "0.14.0",
```

Run `npm install` to refresh the lockfile, then `npm test` to confirm the 63 tests still pass (no behavior change).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import Jimp from 'jimp';
import { buildOrientationField } from './orientationField';

/** Build a PNG buffer from a per-pixel luminance function (0..255). */
async function lumPng(w: number, h: number, lum: (x: number, y: number) => number): Promise<Buffer> {
  const img = await Jimp.create(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(255, Math.round(lum(x, y))));
      img.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
    }
  }
  return img.getBufferAsync(Jimp.MIME_PNG);
}

/** Distance between two angles modulo π (orientation is undirected). */
const angleDistModPi = (a: number, b: number) => {
  const d = Math.abs(((a - b) % Math.PI + Math.PI) % Math.PI);
  return Math.min(d, Math.PI - d);
};

describe('buildOrientationField', () => {
  let vertical: Buffer;   // luminance changes along Y → gradient is vertical
  let horizontal: Buffer; // luminance changes along X → gradient is horizontal
  let flat: Buffer;

  beforeAll(async () => {
    vertical = await lumPng(64, 64, (_x, y) => (y / 63) * 255);
    horizontal = await lumPng(64, 64, (x, _y) => (x / 63) * 255);
    flat = await lumPng(64, 64, () => 128);
  });

  it('vertical gradient → tangent runs horizontal (≈ 0 mod π)', async () => {
    const f = await buildOrientationField(vertical);
    expect(angleDistModPi(f.angleAt(32, 32, 64, 64), 0)).toBeLessThan(0.3);
  });

  it('horizontal gradient → tangent runs vertical (≈ π/2 mod π)', async () => {
    const f = await buildOrientationField(horizontal);
    expect(angleDistModPi(f.angleAt(32, 32, 64, 64), Math.PI / 2)).toBeLessThan(0.3);
  });

  it('flat image → ~zero magnitude and a stable default angle (no NaN/spin)', async () => {
    const f = await buildOrientationField(flat);
    expect(f.magnitudeAt(32, 32, 64, 64)).toBeLessThan(0.05);
    expect(Number.isFinite(f.angleAt(32, 32, 64, 64))).toBe(true);
    expect(f.angleAt(10, 10, 64, 64)).toBe(f.angleAt(50, 50, 64, 64)); // constant default
  });

  it('an edge region has higher magnitude than a flat region', async () => {
    // left half black, right half white → strong vertical edge down the middle
    const edge = await lumPng(64, 64, (x) => (x < 32 ? 0 : 255));
    const f = await buildOrientationField(edge);
    expect(f.magnitudeAt(32, 32, 64, 64)).toBeGreaterThan(f.magnitudeAt(8, 32, 64, 64));
  });

  it('is deterministic (same buffer → identical angles)', async () => {
    const a = await buildOrientationField(vertical);
    const b = await buildOrientationField(vertical);
    expect(a.angleAt(20, 40, 64, 64)).toBe(b.angleAt(20, 40, 64, 64));
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run lib/engine1/orientationField.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write the implementation**

```ts
import Jimp from 'jimp';

export interface OrientationField {
  cols: number;
  rows: number;
  maxMagnitude: number;
  /** Tangent angle (radians, along the form) at a display point. */
  angleAt(dispX: number, dispY: number, dispW: number, dispH: number): number;
  /** Normalised gradient magnitude (0..1) at a display point. */
  magnitudeAt(dispX: number, dispY: number, dispW: number, dispH: number): number;
}

const DEFAULT_ANGLE = 0; // flat regions: a gentle constant so block-in strokes don't spin
const FLAT_EPS = 0.02;   // normalised magnitude below this counts as "flat"

export async function buildOrientationField(buf: Buffer, cols = 200): Promise<OrientationField> {
  const img = await Jimp.read(buf);
  const aspect = img.bitmap.height / img.bitmap.width;
  const gridW = Math.max(8, Math.min(cols, img.bitmap.width));
  const gridH = Math.max(8, Math.round(gridW * aspect));
  const small = img.clone().resize(gridW, gridH).greyscale();

  const lum = (cx: number, cy: number): number => {
    const x = Math.max(0, Math.min(gridW - 1, cx));
    const y = Math.max(0, Math.min(gridH - 1, cy));
    return Jimp.intToRGBA(small.getPixelColor(x, y)).r / 255;
  };

  // Sobel gradient per cell.
  const gx = new Float64Array(gridW * gridH);
  const gy = new Float64Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const tl = lum(x - 1, y - 1), t = lum(x, y - 1), tr = lum(x + 1, y - 1);
      const l = lum(x - 1, y), r = lum(x + 1, y);
      const bl = lum(x - 1, y + 1), b = lum(x, y + 1), br = lum(x + 1, y + 1);
      gx[y * gridW + x] = (tr + 2 * r + br) - (tl + 2 * l + bl);
      gy[y * gridW + x] = (bl + 2 * b + br) - (tl + 2 * t + tr);
    }
  }

  // Structure-tensor smoothing (3×3) → coherent orientation + magnitude.
  const angle = new Float64Array(gridW * gridH);
  const mag = new Float64Array(gridW * gridH);
  let maxMag = 0;
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      let jxx = 0, jyy = 0, jxy = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(gridW - 1, x + dx));
          const ny = Math.max(0, Math.min(gridH - 1, y + dy));
          const vx = gx[ny * gridW + nx], vy = gy[ny * gridW + nx];
          jxx += vx * vx; jyy += vy * vy; jxy += vx * vy;
        }
      }
      const gradAngle = 0.5 * Math.atan2(2 * jxy, jxx - jyy); // dominant gradient direction
      angle[y * gridW + x] = gradAngle + Math.PI / 2;          // tangent ⊥ gradient = along the form
      const m = Math.sqrt(jxx + jyy);
      mag[y * gridW + x] = m;
      if (m > maxMag) maxMag = m;
    }
  }
  for (let i = 0; i < mag.length; i++) mag[i] = maxMag > 0 ? mag[i] / maxMag : 0;

  const cellOf = (dispX: number, dispY: number, dispW: number, dispH: number): number => {
    const cx = Math.max(0, Math.min(gridW - 1, Math.floor((dispX / dispW) * gridW)));
    const cy = Math.max(0, Math.min(gridH - 1, Math.floor((dispY / dispH) * gridH)));
    return cy * gridW + cx;
  };

  return {
    cols: gridW,
    rows: gridH,
    maxMagnitude: maxMag,
    angleAt(dispX, dispY, dispW, dispH) {
      const i = cellOf(dispX, dispY, dispW, dispH);
      return mag[i] < FLAT_EPS ? DEFAULT_ANGLE : angle[i];
    },
    magnitudeAt(dispX, dispY, dispW, dispH) {
      return mag[cellOf(dispX, dispY, dispW, dispH)];
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run lib/engine1/orientationField.test.ts` → PASS.
- [ ] **Step 5: Full suite + tsc** — `npm test` (all prior + 5 new green); `npx tsc --noEmit` (only the 4 pre-existing errors).
- [ ] **Step 6: Commit** — `git add package.json package-lock.json lib/engine1/orientationField.ts lib/engine1/orientationField.test.ts && git commit -m "feat(oil): orientation field (Sobel + structure tensor) + declare jimp"`

---

#### Task 8: oilStrokes skeleton — layers 0–1, ordering, determinism (`oilStrokes.ts`)

**Files:**
- Create: `lib/engine1/oilStrokes.ts`
- Test: `lib/engine1/oilStrokes.test.ts`

**Interfaces:**
- Consumes: `buildOrientationField`/`OrientationField` (Task 7); `OilStroke` (`@/lib/drawing/oilTypes`); jimp.
- Produces: `interface Rect { x: number; y: number; w: number; h: number }`; `interface FaceBox { box: Rect; eyesMouth?: Rect }`; `deriveOilStrokesFromBuffer(buf: Buffer, dispW: number, dispH: number, faceBox?: FaceBox | null): Promise<OilStroke[]>`. Consumed by Tasks 9–11.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import Jimp from 'jimp';
import { deriveOilStrokesFromBuffer } from './oilStrokes';

async function busyPng(w: number, h: number): Promise<Buffer> {
  const img = await Jimp.create(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = ((x ^ y) & 16) ? 220 : 40; // high-contrast checker → lots of detail
      img.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
    }
  return img.getBufferAsync(Jimp.MIME_PNG);
}

describe('deriveOilStrokesFromBuffer (layers 0–1)', () => {
  let buf: Buffer;
  beforeAll(async () => { buf = await busyPng(128, 160); });

  it('produces valid in-bounds strokes', async () => {
    const s = await deriveOilStrokesFromBuffer(buf, 400, 500);
    expect(s.length).toBeGreaterThan(0);
    for (const k of s) {
      expect(k.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(k.width).toBeGreaterThan(0);
      expect(k.length).toBeGreaterThan(0);
      expect(Number.isFinite(k.angle)).toBe(true);
      expect(k.x).toBeGreaterThanOrEqual(0); expect(k.x).toBeLessThanOrEqual(400);
      expect(k.y).toBeGreaterThanOrEqual(0); expect(k.y).toBeLessThanOrEqual(500);
    }
  });

  it('is strictly layer-ascending AND contiguous (no gaps/interleaving — the scheduler indexes by per-layer count)', async () => {
    const layers = (await deriveOilStrokesFromBuffer(buf, 400, 500)).map((k) => k.layer);
    expect(new Set(layers)).toEqual(new Set([0, 1]));
    // Monotonic non-decreasing ⇒ each layer is one contiguous block; assert that explicitly.
    for (let i = 1; i < layers.length; i++) expect(layers[i]).toBeGreaterThanOrEqual(layers[i - 1]);
    const firstOne = layers.indexOf(1);
    expect(layers.slice(0, firstOne).every((L) => L === 0)).toBe(true); // every stroke before the first layer-1 is layer-0
    expect(layers.slice(firstOne).every((L) => L === 1)).toBe(true);    // and no layer-0 ever reappears after
  });

  it('takes each stroke angle from the orientation field tangent (consistent with T7)', async () => {
    // HORIZONTAL luminance gradient → field tangent runs VERTICAL (≈ π/2 mod π).
    // Strokes must run ALONG the form. A constant/hardcoded angle (e.g. 0) would FAIL this test —
    // only an angle genuinely read from the field passes, tying T8 to T7's verified tangent.
    const img = await Jimp.create(128, 160);
    for (let y = 0; y < 160; y++) for (let x = 0; x < 128; x++) {
      const v = Math.round((x / 127) * 255);
      img.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
    }
    const grad = await img.getBufferAsync(Jimp.MIME_PNG);
    const strokes = await deriveOilStrokesFromBuffer(grad, 400, 500);
    const distToVertical = (a: number) => {
      const d = Math.abs((((a - Math.PI / 2) % Math.PI) + Math.PI) % Math.PI);
      return Math.min(d, Math.PI - d);
    };
    const dists = strokes.map((s) => distToVertical(s.angle)).sort((x, y) => x - y);
    expect(dists[Math.floor(dists.length / 2)]).toBeLessThan(0.3); // median angle ≈ vertical
  });

  it('layer 0 blocks in across the whole canvas (top and bottom both covered)', async () => {
    // Layer 0 has the gate `() => true`, so it covers the full jittered grid regardless of content.
    // (Do NOT assert layer0 >= layer1: layer 1 has a finer grid (step 22 < 34) and on a busy image
    //  legitimately produces MORE strokes — that is correct, not a bug.)
    const s0 = (await deriveOilStrokesFromBuffer(buf, 400, 500)).filter((k) => k.layer === 0);
    expect(s0.length).toBeGreaterThan(0);
    expect(s0.some((k) => k.y < 100)).toBe(true);   // strokes near the top
    expect(s0.some((k) => k.y > 400)).toBe(true);   // strokes near the bottom
  });

  it('is deterministic', async () => {
    const a = await deriveOilStrokesFromBuffer(buf, 400, 500);
    const b = await deriveOilStrokesFromBuffer(buf, 400, 500);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run lib/engine1/oilStrokes.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write the implementation**

```ts
import Jimp from 'jimp';
import type { OilStroke } from '@/lib/drawing/oilTypes';
import { buildOrientationField } from './orientationField';

export interface Rect { x: number; y: number; w: number; h: number }
export interface FaceBox { box: Rect; eyesMouth?: Rect }

// Per-layer params, matched to the validated M1 fixture look (tuned further in M4).
const LAYER_WIDTH = [30, 18, 10, 6, 4, 5];
const LAYER_LENGTH = [30, 20, 12, 8, 5, 7];
const LAYER_STEP = [34, 22, 14, 9, 5, 7]; // grid spacing in display px

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const hex2 = (n: number) => clamp8(n).toString(16).padStart(2, '0');
// Deterministic pseudo-random in [0,1) from an integer seed (same as the fixture).
const rnd = (i: number) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

export async function deriveOilStrokesFromBuffer(
  buf: Buffer,
  dispW: number,
  dispH: number,
  _faceBox: FaceBox | null = null, // accepted now; used from Task 9 (box boost) / Task 10 (eyes-mouth)
): Promise<OilStroke[]> {
  const field = await buildOrientationField(buf);

  // Small colour-sampling grid (bilinear average per cell).
  const img = await Jimp.read(buf);
  const cW = Math.max(8, Math.min(64, img.bitmap.width));
  const cH = Math.max(8, Math.round((cW * img.bitmap.height) / img.bitmap.width));
  const small = img.clone().resize(cW, cH);
  const sampleColor = (dispX: number, dispY: number, seed: number): string => {
    const cx = Math.max(0, Math.min(cW - 1, Math.floor((dispX / dispW) * cW)));
    const cy = Math.max(0, Math.min(cH - 1, Math.floor((dispY / dispH) * cH)));
    const { r, g, b } = Jimp.intToRGBA(small.getPixelColor(cx, cy));
    const j = (rnd(seed) - 0.5) * 16; // ±8 seeded colour jitter
    return `#${hex2(r + j)}${hex2(g + j)}${hex2(b + j)}`;
  };

  const out: OilStroke[] = [];
  // Emit one layer over a jittered grid, keeping a stroke only where `gate` passes.
  const emitLayer = (layer: number, gate: (x: number, y: number) => boolean) => {
    const step = LAYER_STEP[layer];
    let seed = layer * 100000;
    for (let y = step / 2; y < dispH; y += step) {
      for (let x = step / 2; x < dispW; x += step) {
        if (!gate(x, y)) continue;
        const jx = (rnd(seed++) - 0.5) * step * 0.6;
        const jy = (rnd(seed++) - 0.5) * step * 0.6;
        const px = Math.max(0, Math.min(dispW, x + jx));
        const py = Math.max(0, Math.min(dispH, y + jy));
        out.push({
          x: px, y: py,
          angle: field.angleAt(px, py, dispW, dispH),
          length: LAYER_LENGTH[layer],
          width: LAYER_WIDTH[layer],
          color: sampleColor(px, py, seed),
          layer,
        });
      }
    }
  };

  emitLayer(0, () => true);                                          // block-in: covers everything
  emitLayer(1, (x, y) => field.magnitudeAt(x, y, dispW, dispH) > 0.15); // forms: low magnitude gate
  return out; // already layer-ascending (0 then 1)
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run lib/engine1/oilStrokes.test.ts` → PASS.
- [ ] **Step 5: Full suite + tsc** (all green; only the 4 pre-existing tsc errors).
- [ ] **Step 6: Commit** — `git add lib/engine1/oilStrokes.ts lib/engine1/oilStrokes.test.ts && git commit -m "feat(oil): oilStrokes skeleton — block-in + forms layers, ordered & deterministic"`

---

#### Task 9: layers 2–3 detail gating + face-box density boost (`oilStrokes.ts`)

**Files:**
- Modify: `lib/engine1/oilStrokes.ts`
- Modify: `lib/engine1/oilStrokes.test.ts`

**Interfaces:** unchanged public signature; now consumes `faceBox.box`.

- [ ] **Step 1: Add failing tests** (append to the existing describe block)

```ts
describe('deriveOilStrokesFromBuffer (layers 2–3 + box boost)', () => {
  it('a busy image yields more layer 2–3 strokes than a flat image', async () => {
    const busy = await busyPng(128, 160);
    const flatImg = await Jimp.create(128, 160);
    for (let y = 0; y < 160; y++) for (let x = 0; x < 128; x++) flatImg.setPixelColor(Jimp.rgbaToInt(128,128,128,255), x, y);
    const flat = await flatImg.getBufferAsync(Jimp.MIME_PNG);
    const det = (s: { layer: number }[]) => s.filter((k) => k.layer === 2 || k.layer === 3).length;
    expect(det(await deriveOilStrokesFromBuffer(busy, 400, 500)))
      .toBeGreaterThan(det(await deriveOilStrokesFromBuffer(flat, 400, 500)));
  });

  // Helper (add near busyPng): quadratic luminance ramp → a CONTINUUM of detail magnitudes
  // (slope grows with x), so some cells land between the boosted and base gate thresholds.
  // async function gradPng(w, h) {
  //   const img = await Jimp.create(w, h);
  //   for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  //     const v = Math.round((x / (w - 1)) ** 2 * 255);
  //     img.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
  //   }
  //   return img.getBufferAsync(Jimp.MIME_PNG);
  // }
  it('box boost is a DENSITY effect: strictly more layer 2–3 strokes centred INSIDE the box', async () => {
    // gradPng gives a continuum of magnitudes (no saturation), so lowering the gate inside the box
    // is a strict superset there. Pin the positive effect: more detail strokes land inside the box.
    // (Localization — that the boost is confined to the box, not global — is verified by CODE-READ in
    //  review: the gate is `inRect(x,y,box) ? base - boost : base`. An emergent "nothing added outside"
    //  equality is fragile because the per-pass seed advance diverges the outside jitter between runs.)
    const grad = await gradPng(128, 160);
    const box = { x: 0, y: 0, w: 200, h: 500 }; // left half, display coords
    const detIn = (s: { layer: number; x: number }[]) =>
      s.filter((k) => (k.layer === 2 || k.layer === 3) && k.x <= 200).length;
    const base = await deriveOilStrokesFromBuffer(grad, 400, 500, null);
    const boosted = await deriveOilStrokesFromBuffer(grad, 400, 500, { box });
    expect(detIn(boosted)).toBeGreaterThan(detIn(base));
  });

  it('stays strictly layer-ascending AND contiguous over {0,1,2,3}', async () => {
    const layers = (await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, { box: { x: 0, y: 0, w: 400, h: 500 } })).map((k) => k.layer);
    expect(new Set(layers)).toEqual(new Set([0, 1, 2, 3]));
    expect(layers).toEqual([...layers].sort((a, b) => a - b)); // monotonic non-decreasing ⇒ contiguous blocks, no interleaving
    expect(Math.max(...layers)).toBe(3);
  });

  it('faceBox=null → pure-magnitude fallback: valid non-empty plan, layers 0–3 only', async () => {
    const s = await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, null);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((k) => k.layer >= 0 && k.layer <= 3)).toBe(true);
  });

  it('does NOT emit any eyes/mouth (layer 4+) pass yet — deferred to T10 — even when eyesMouth is provided', async () => {
    const s = await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, {
      box: { x: 120, y: 110, w: 160, h: 190 },
      eyesMouth: { x: 150, y: 180, w: 100, h: 120 },
    });
    expect(s.some((k) => k.layer >= 4)).toBe(false); // T9 ignores eyesMouth; no layer-4 special-casing
    expect(Math.max(...s.map((k) => k.layer))).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail** (layers 2–3 not emitted yet) — `npx vitest run lib/engine1/oilStrokes.test.ts`.

- [ ] **Step 3: Implement** — add a box-aware gate helper and emit layers 2–3 after layer 1, before `return`:

```ts
  // inside deriveOilStrokesFromBuffer, replace the two emitLayer(...) calls + return with:
  const inRect = (x: number, y: number, rect?: Rect) =>
    !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

  // Magnitude gate that relaxes inside the face box (more, smaller strokes there).
  const magGate = (base: number, boost: number) => (x: number, y: number) => {
    const m = field.magnitudeAt(x, y, dispW, dispH);
    const thresh = inRect(x, y, _faceBox?.box) ? base - boost : base;
    return m > thresh;
  };

  emitLayer(0, () => true);
  emitLayer(1, (x, y) => field.magnitudeAt(x, y, dispW, dispH) > 0.15);
  emitLayer(2, magGate(0.30, 0.20)); // detail: mid gate, boosted inside the box
  emitLayer(3, magGate(0.50, 0.25)); // fine: high gate, boosted inside the box
  return out;
```

- [ ] **Step 4: Run to verify pass.** **Step 5: Full suite + tsc.** **Step 6: Commit** — `git commit -m "feat(oil): layers 2–3 detail gating + face-box density boost"`

---

#### Task 10: layer 4 (eyes/mouth) + layer 5 (accents) + locality + budget (`oilStrokes.ts`)

**Files:** Modify `lib/engine1/oilStrokes.ts` + its test.

- [ ] **Step 1a: Reconcile the now-obsolete prior-task layer-set assertions (REQUIRED FIRST).**

T10 adds layers **4 and 5** to the same function, which falsifies four already-committed tests that assert "only layers ≤ 3". This is expected lifecycle (those were correct scaffolding for T8/T9), but it must be done with exact edits — not improvised — and converted to **layer-set-agnostic** contiguity so they never break again in M3/M4. In `lib/engine1/oilStrokes.test.ts`:

1. `(layers 0–1)` block, test `'is strictly layer-ascending AND contiguous ...'` — replace its body with:
```ts
    const layers = (await deriveOilStrokesFromBuffer(buf, 400, 500)).map((k) => k.layer);
    expect(layers.length).toBeGreaterThan(0);
    expect(layers).toEqual([...layers].sort((a, b) => a - b)); // ascending ⇒ contiguous blocks (no interleaving); layer-set-agnostic
    expect(layers).not.toContain(4); // no eyesMouth provided → no dedicated eyes/mouth pass
```

2. `(layers 2–3 + box boost)` block, test `'stays strictly layer-ascending AND contiguous over {0,1,2,3}'` — rename to `'stays strictly layer-ascending AND contiguous (full-canvas box, no eyesMouth)'` and replace its body with:
```ts
    const layers = (await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, { box: { x: 0, y: 0, w: 400, h: 500 } })).map((k) => k.layer);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
    expect(layers).not.toContain(4); // box boost is density-only; no eyesMouth ⇒ still no layer 4
```

3. `(layers 2–3 + box boost)` block, test `'faceBox=null → pure-magnitude fallback: valid non-empty plan, layers 0–3 only'` — rename to `'faceBox=null → pure-magnitude fallback: valid non-empty, no layer 4'` and replace its body with:
```ts
    const s = await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, null);
    expect(s.length).toBeGreaterThan(0);
    expect(s.some((k) => k.layer === 4)).toBe(false); // layer 4 needs eyesMouth; accents (5) may still appear
```

4. `(layers 2–3 + box boost)` block, test `'does NOT emit any eyes/mouth (layer 4+) pass yet — deferred to T10 ...'` — **DELETE it entirely.** T10 implements exactly that pass; the `'emits a layer-4 pass IFF eyesMouth'` test below is its replacement.

- [ ] **Step 1b: Add the T10 failing tests** (new describe block):

```ts
describe('deriveOilStrokesFromBuffer (layers 4–5, locality, budget)', () => {
  it('emits a layer-4 pass IFF eyesMouth is present, confined (within jitter) to that rect', async () => {
    const buf = await busyPng(128, 160);
    const noFace = (await deriveOilStrokesFromBuffer(buf, 400, 500, null)).filter((k) => k.layer === 4);
    expect(noFace.length).toBe(0); // no eyesMouth ⇒ no dedicated pass
    const em = { x: 150, y: 180, w: 100, h: 120 };
    const withEM = (await deriveOilStrokesFromBuffer(buf, 400, 500, { box: { x: 120, y: 110, w: 160, h: 190 }, eyesMouth: em })).filter((k) => k.layer === 4);
    expect(withEM.length).toBeGreaterThan(0);
    const M = 2; // layer-4 step is 5 ⇒ jitter ≤ ±1.5px; the GATE checks the grid point, the stroke is jittered, so allow a 2px margin
    for (const k of withEM) {
      expect(k.x).toBeGreaterThanOrEqual(em.x - M); expect(k.x).toBeLessThanOrEqual(em.x + em.w + M);
      expect(k.y).toBeGreaterThanOrEqual(em.y - M); expect(k.y).toBeLessThanOrEqual(em.y + em.h + M);
    }
  });

  it('emits layer-5 accents that sort LAST; whole array ascending AND contiguous through 0..5', async () => {
    const s = await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, { box: { x: 120, y: 110, w: 160, h: 190 }, eyesMouth: { x: 150, y: 180, w: 100, h: 120 } });
    const layers = s.map((k) => k.layer);
    expect(layers).toEqual([...layers].sort((a, b) => a - b)); // ascending ⇒ contiguous
    expect(layers[layers.length - 1]).toBe(5);                  // accents land last
    expect(new Set(layers)).toEqual(new Set([0, 1, 2, 3, 4, 5])); // all six layers present with box + eyesMouth
  });

  it('caps at the stroke budget AND actually engages thinning (not a vacuous ≤4000)', async () => {
    // A canvas-sized eyesMouth makes layer 4 (step 5) alone emit 80×100 = 8000 strokes,
    // so the RAW count exceeds the 4000 cap and the thinning branch MUST run. (A plain
    // null-faceBox source can stay under 4000, passing ≤4000 without ever thinning — vacuous.)
    const s = await deriveOilStrokesFromBuffer(await busyPng(128, 160), 400, 500, {
      box: { x: 0, y: 0, w: 400, h: 500 },
      eyesMouth: { x: 0, y: 0, w: 400, h: 500 },
    });
    expect(s.length).toBeLessThanOrEqual(4000); // cap enforced
    expect(s.length).toBeGreaterThan(1000);     // sanity: thinning capped but didn't gut the plan
  });
});
```

(The `faceBox=null → no layer 4` fallback is already covered by reconciled test #3 above, so it is not duplicated here.)

- [ ] **Step 2: Run to verify the new tests fail** (and the reconciled prior tests now reflect layers 0–5).

- [ ] **Step 3: Implement** — add layer 4 (only when `eyesMouth`), layer 5 (accents: dark + high-mag), within-layer serpentine locality ordering, and a budget cap. Replace the emit block + return with:

```ts
  const luminanceAt = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(cW - 1, Math.floor((x / dispW) * cW)));
    const cy = Math.max(0, Math.min(cH - 1, Math.floor((y / dispH) * cH)));
    const { r, g, b } = Jimp.intToRGBA(small.getPixelColor(cx, cy));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };

  emitLayer(0, () => true);
  emitLayer(1, (x, y) => field.magnitudeAt(x, y, dispW, dispH) > 0.15);
  emitLayer(2, magGate(0.30, 0.20));
  emitLayer(3, magGate(0.50, 0.25));
  if (_faceBox?.eyesMouth) {
    const em = _faceBox.eyesMouth;
    emitLayer(4, (x, y) => inRect(x, y, em)); // dedicated, dense, confined to eyes/mouth
  }
  // Accents: darkest darks with high local detail; darkened colour, sort last.
  const accentStart = out.length;
  emitLayer(5, (x, y) => luminanceAt(x, y) < 0.30 && field.magnitudeAt(x, y, dispW, dispH) > 0.45);
  for (let i = accentStart; i < out.length; i++) {
    const { r, g, b } = Jimp.intToRGBA(small.getPixelColor(
      Math.max(0, Math.min(cW - 1, Math.floor((out[i].x / dispW) * cW))),
      Math.max(0, Math.min(cH - 1, Math.floor((out[i].y / dispH) * cH))),
    ));
    out[i].color = `#${hex2(r * 0.4)}${hex2(g * 0.4)}${hex2(b * 0.4)}`; // bite of dark
  }

  // Within-layer locality: serpentine sweep (row band, alternating left/right) — keeps layer-ascending.
  const BAND = 40;
  const ordered = out
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => {
      if (a.s.layer !== b.s.layer) return a.s.layer - b.s.layer;
      const ba = Math.floor(a.s.y / BAND), bb = Math.floor(b.s.y / BAND);
      if (ba !== bb) return ba - bb;
      const dir = ba % 2 === 0 ? 1 : -1;
      if (a.s.x !== b.s.x) return (a.s.x - b.s.x) * dir;
      return a.idx - b.idx; // stable
    })
    .map((e) => e.s);

  // Budget: ~4k cap; thin uniformly per layer if exceeded (logged, never silent).
  const BUDGET = 4000;
  if (ordered.length > BUDGET) {
    const keep = BUDGET / ordered.length;
    const thinned = ordered.filter((_, i) => rnd(i) < keep);
    console.warn(`[oilStrokes] budget thinning: ${ordered.length} → ${thinned.length} (cap ${BUDGET})`);
    return thinned;
  }
  return ordered;
```

> Note: thinning is an order-preserving `filter`, so layer-ascending CONTIGUITY is preserved (the kept subset is still sorted). It is deterministic (`rnd(i)`). The only edge it doesn't guarantee is keeping the very last accent if that index is thinned — cosmetic, never hit at M2 fixture sizes (the budget test's 256×320 source does exceed the cap and exercises the warn path, but layers retain hundreds of strokes each, so none empties and the last surviving stroke is still a layer-5 accent). M4 revisits thinning.

- [ ] **Step 4: Run to verify pass.** **Step 5: Full suite + tsc.** **Step 6: Commit** — `git commit -m "feat(oil): eyes/mouth + accent layers, serpentine locality, stroke budget"`

---

#### Task 11: oil generation service (`oilGenerationService.ts`)

**Files:**
- Create: `lib/engine1/oilGenerationService.ts`
- Test: `lib/engine1/oilGenerationService.test.ts`

**Interfaces:**
- Consumes: `loadImageBuffer` (`./imageSource`), `deriveLineArtFromBuffer` (`./derive`), `traceToStrokePaths` (`./lineart`), `deriveOilStrokesFromBuffer` (`./oilStrokes`), `PortraitEngine`/`PortraitInput` (`./portraitEngine`), `OilDrawingPlan` (`@/lib/drawing/oilTypes`).
- Produces: `generateOilDrawingPlan(input: PortraitInput, engine: PortraitEngine): Promise<OilDrawingPlan>`. (M3 will pass a real `faceBox` here; M2 passes `null`.)

- [ ] **Step 1: Write the failing test** (mirrors `generationService.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { generateOilDrawingPlan } from './oilGenerationService';
import { generateDrawingPlan } from './generationService'; // v1 must remain intact
import type { PortraitEngine } from './portraitEngine';

const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAAwklEQVR4Ae3BgWkEQQDEMO9w/be8SQ3xBR7e0rm/yJ+NKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3DO4ZPde/lvI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKiDKijCgjyogyoowoI8qIMqKMKCPKg3Dv5duNKCPKiDKijCgjyogyoowoDy875/DJ7r28aUQZUUaUEWVEGVFGlBFlRHl42b2XbzKijCgjyogyoowoI8qIMqKMKCPKiDKijCg/xkUQnmgvYDQAAAAASUVORK5CYII=';
const SAMPLE_DATA_URL = 'data:image/png;base64,' + SAMPLE_PNG_B64;
const fakeEngine: PortraitEngine = { async generate() { return { colorImage: SAMPLE_DATA_URL, width: 80, height: 80 }; } };

describe('generateOilDrawingPlan', () => {
  it('assembles a valid v2 OilDrawingPlan from engine output', async () => {
    const plan = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(plan.width).toBe(80);
    expect(plan.height).toBe(80);
    expect(plan.colorImage).toBe(SAMPLE_DATA_URL);
    expect(Array.isArray(plan.strokePaths)).toBe(true);
    expect(plan.strokePaths.length).toBeGreaterThan(0);
    expect(plan.oilStrokes.length).toBeGreaterThan(0);
  });

  it('orders oilStrokes by layer ascending', async () => {
    const { oilStrokes } = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    for (let i = 1; i < oilStrokes.length; i++) expect(oilStrokes[i].layer).toBeGreaterThanOrEqual(oilStrokes[i - 1].layer);
  });

  it('uses v2 timing with photoGlaze 0 and carries NO shading field', async () => {
    const plan = await generateOilDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(plan.timing.photoGlaze).toBe(0);
    expect(plan.timing.blockInMs).toBeGreaterThan(0);
    expect(plan.timing.refineMs).toBeGreaterThan(0);
    expect('shadingLayer' in plan).toBe(false);
  });

  it('leaves the v1 generateDrawingPlan importable/working (untouched)', async () => {
    const v1 = await generateDrawingPlan({ selfie: 'x', team: 'Brazil' }, fakeEngine);
    expect(v1.brushStrokes.length).toBeGreaterThan(0); // v1 still produces its own shape
  });
});
```

- [ ] **Step 2: Run to verify it fails** (module missing).

- [ ] **Step 3: Implement**

```ts
import type { OilDrawingPlan } from '@/lib/drawing/oilTypes';
import { traceToStrokePaths } from './lineart';
import { deriveLineArtFromBuffer } from './derive';
import { deriveOilStrokesFromBuffer } from './oilStrokes';
import { loadImageBuffer } from './imageSource';
import type { PortraitEngine, PortraitInput } from './portraitEngine';

// v2 timing (spec §4): ~22s shaped curve. Tuned further in M4.
export const OIL_TIMING = { outlineMs: 3000, blockInMs: 5000, refineMs: 11000, accentMs: 3000, photoGlaze: 0 };

export async function generateOilDrawingPlan(
  input: PortraitInput,
  engine: PortraitEngine,
): Promise<OilDrawingPlan> {
  const out = await engine.generate(input);
  const buf = await loadImageBuffer(out.colorImage);
  const lineArt = await deriveLineArtFromBuffer(buf);
  const strokePaths = await traceToStrokePaths(lineArt);
  // M2: no face detector yet → faceBox null (pure detail-driven). M3 wires the real detector here.
  const oilStrokes = await deriveOilStrokesFromBuffer(buf, out.width, out.height, null);
  return {
    width: out.width,
    height: out.height,
    strokePaths,
    oilStrokes,
    colorImage: out.colorImage,
    timing: { ...OIL_TIMING },
  };
}
```

- [ ] **Step 4: Run to verify pass.** **Step 5: Full suite + tsc.** **Step 6: Commit** — `git commit -m "feat(oil): generateOilDrawingPlan assembles the v2 plan (no shading, photoGlaze 0)"`

**M2 EXIT CRITERIA:** `generateOilDrawingPlan` produces a valid layer-ordered `OilDrawingPlan` from a real image buffer with zero AI cost on the fixture path; the orientation field + 6 layers are unit-tested and deterministic; v1 generation is untouched; suite + tsc green. (Likeness is still detail-only — the dedicated eyes/mouth pass activates once M3 supplies a real `faceBox`.)

### M3 — face targeting

**Task 9 — add dependency.** `npm i onnxruntime-node` + a BlazeFace model asset (record exact version + license in the task). Commit lockfile.

**Task 10 — `lib/engine1/faceBox.ts` (+ test).** `detectFaceBox(buf: Buffer): Promise<FaceBox | null>` where `FaceBox = { box: {x,y,w,h}; eyesMouth?: {x,y,w,h} }`. Spans `eyesMouth` from BlazeFace's **coarse keypoints** (eyes, nose, mouth) — no precise contours. On any error/miss → `null`. Wire into `oilGenerationService` (call `detectFaceBox`, pass result to `deriveOilStrokesFromBuffer`). Test: **mock the detector** to assert the seam — detector throws/returns null → `faceBox.ts` returns `null` and generation still produces a valid plan. The model itself is not unit-tested.

### M4 — choreography polish

**Task 11 — pacing + tool tuning.** Tune `timing` defaults and `LAYER4_RESERVE_MS` against real generated portraits; add distinct tool sprites (`/tool-pencil.svg`, `/tool-brush.svg`, `/tool-pen.svg`) and map them in `OilPerformance`'s `TOOL_SRC`. Add a scheduler test asserting the tool sequence over a full timeline (pencil→brushBig→brushMid→brushFine→pen→null). Verify in `/dev/oil`.

### M5 — switch app over + retire v1 (the ONLY milestone that edits/deletes v1)

**Task 12 — adopt v2 as the canonical contract.** Move `OilStroke`/`OilDrawingPlan`/timing into `lib/drawing/types.ts`, renaming `OilDrawingPlan`→`DrawingPlan` (the spec's final name); update `oil*` imports.

**Task 13 — switch the route + flow.** `app/api/generate/route.ts` calls `generateOilDrawingPlan`; mock mode returns `OIL_FIXTURE` (or a derived mock plan); `app/page.tsx`/`EaselScreen.tsx` render `OilPerformance` instead of `DrawingPerformance`.

**Task 14 — souvenir = painted snapshot.** `ResultView.tsx` downloads the painting `<canvas>` via `toBlob()` (lift the snapshot from `OilPerformance` via a ref/callback), **not** `plan.colorImage`. Add a note that `photoGlaze > 0` taints the canvas and disables export.

**Task 15 — delete v1 + reconcile tests.** Remove `components/DrawingPerformance.tsx`, `lib/drawing/performanceScheduler.ts`, `lib/engine1/brushStrokes.ts`, the shading derivation in `derive.ts`, and the v1 `brushStrokes`/`shadingLayer` fields + the old fixture's brush parts. Update or delete their tests (`DrawingPerformance.test.tsx`, `performanceScheduler.test.ts`, the brushStrokes test, the `derive` shading test, the fixtures test). Run `npm run test` + `npm run build`; both green. Move `/dev/oil` behind a dev-only guard or delete it.

**M5 EXIT CRITERIA:** the real app flow performs the oil engine end-to-end, the download is the painted snapshot, no v1 reveal/shading code remains, and the suite + build are green.

---

## Self-Review

**Spec coverage (redesign spec → task):**
- §1.1 pure strokes / no blend → no `drawImage(colorImage)` anywhere; Tasks 5, 14. ✅
- §1.2 likeness inside engine → Layer-4 in Tasks 4, 7, 10. ✅
- §1.3 photoGlaze default 0 → enforced in types (Task 1), fixture (Task 4), service (Task 8); taint note (Task 14). ✅
- §1.4 oil/bristle → Task 3. ✅
- §1.5 hybrid face targeting (box boost vs dedicated Layer-4) → Tasks 7, 10. ✅
- §1.6 ~20–25s shaped pacing → Task 2 + fixture timing (3+5+11+3=22s). ✅
- §1.7 classic SBR / Canvas 2D / server-derived → whole plan; derivation server-side in M2/M3. ✅
- §1.8 accumulating bitmap → Task 5 (cursor; paint-once). ✅
- §1.9 detail-map + face detection server-side, browser dumb → derivation in `lib/engine1/*`; `OilPerformance` only performs. ✅; non-blocking fallback in Tasks 7, 10. ✅
- §2 reuse/replace/delete + v2 contract → Task 1 (contract); reuse `strokePaths`/hand (Task 5); delete shading/blend/brushStrokes (Task 15). ✅
- §3 derivation (field, layers, ordering, fallback) → Task 7. ✅
- §4 timeline, 3-layer stack, bristles, texture, perf, taint → Tasks 2, 3, 5, 14. ✅
- §5 tests + milestones M0–M5, decoupled-first → plan structure. ✅
- §6 BlazeFace coarse keypoints, resolution policy, keep potrace outline → Tasks 10 (BlazeFace), 8/5 (strokePaths reused via potrace), souvenir resolution = render resolution for now (Task 14). ✅

**Placeholder scan:** M0–M1 steps contain full code + exact commands. M2–M5 are deliberately outlined (rationale stated) with concrete files/interfaces/tests — to be expanded to bite-sized steps when each milestone starts; no "TBD"/"add error handling"-style gaps. ✅

**Type consistency:** `OilStroke`/`OilDrawingPlan`/`OilTiming`/`OilRenderState`/`Tool`/`OilPhase` defined once (Task 1) and consumed unchanged in Tasks 2–8; `computeOilState`, `paintOilStroke`, `paintGround`, `bristleCount`, `deriveOilStrokesFromBuffer`, `generateOilDrawingPlan`, `detectFaceBox` names are consistent across their producer/consumer blocks. ✅
