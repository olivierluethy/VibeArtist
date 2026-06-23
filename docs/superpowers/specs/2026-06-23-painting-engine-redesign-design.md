# DrawMyAI — Painting Engine Redesign (Engine 2 renderer) — Design

> **Date:** 2026-06-23 · **Status:** Approved (design); ready for implementation plan
> **Scope:** Redesign Engine 2's *renderer* as a true stroke-based / painterly oil engine.
> **Not in scope:** Engine 1 generation/provider, the app flow, vibes beyond World Cup.

---

## 0. Context & reframe

DrawMyAI already ships a v1 on `master`: **Engine 1** (server) generates a portrait and packages a
`DrawingPlan`; **Engine 2** (browser) performs it (outline → shading → color flood, with a hand).
This design is **not greenfield** — it is a focused redesign of *how Engine 2 paints*, because the
current color stage does not meet the product's core requirement.

**The problem with today's engine:**
- Color strokes are axis-aligned horizontal runs on an 18-column grid (no orientation, no texture).
- Shading is a grayscale `<img>` that fades in — a reveal, not strokes.
- The performance ends by cross-blending the real AI photo (`drawImage(photo)`) at rising opacity —
  i.e. it literally reveals the flat AI image, the one thing the product must never do.
- The renderer redraws **all** strokes every frame (O(n²)), so it cannot scale to thousands.

**What stays (the boundary is unchanged):** Engine 1 → `DrawingPlan` → Engine 2 generate-then-perform
seam; the Phase-1 line sketch; the hand sprite; the mock-mode fixture harness; Engine 1's fetch-once;
the existing 39 tests.

---

## 1. Locked decisions (the spine of this design)

1. **Final canvas = 100% strokes.** A faithful *painterly interpretation* of the reference, deliberately
   **not** pixel-identical. No photo blend in the standard path.
2. **Likeness is solved inside the stroke engine**, not with a glaze: the face is a high-density region;
   the eyes/mouth get a dedicated refinement pass.
3. **`photoGlaze` parameter exists but defaults to 0** — emergency tuning dial only, never standard.
   (It also silently disables the souvenir export — see §4E.)
4. **Style = oil, impasto with visible bristle tracks** (chosen via a live side-by-side demo on the same
   face; oil carried identity on strokes alone where watercolour turned to mush).
5. **Hybrid face targeting:** detail-driven density everywhere **+** a face box, **+** a dedicated
   eyes/mouth sub-region pass.
6. **Show duration ≈ 20–25s** (default ~22s), all timings tunable. Pacing is a *shaped curve*, not a
   monotonic accelerate.
7. **Engine: classic stroke-based rendering, Canvas 2D, strokes derived server-side.**
8. **Accumulating bitmap**: each stroke painted once onto a persistent canvas; no full redraw per frame.
9. **Detail-map AND face-box detection live server-side** in stroke derivation. The browser is a dumb
   performer of a finished plan; it never detects or samples. The non-blocking face fallback is therefore
   a server concern.

---

## 2. Architecture — reuse / replace / delete, and the v2 contract

| Today | Decision | Why |
|---|---|---|
| `strokePaths` (potrace SVG outline), self-drawn | **Reuse** (Phase 1) | Reads as "artist starts sketching." |
| `brushStrokes` (grid runs) | **Replace** → `oilStrokes` | Crude horizontal sweeps are the core look problem. |
| `shadingLayer` (grayscale fade) | **Delete (obsolete)** | Shading emerges from genuinely darker oil strokes. |
| Final `drawImage(photo)` blend | **Delete** | The "revealed flat image" cheat. |
| `colorImage` | **Demote** | Server sampling buffer + glaze source only; never painted. Souvenir = painted canvas snapshot. |
| Hand sprite, mock harness, fetch-once, 39 tests | **Reuse** | Intact. |

**`DrawingPlan` v2:**
```ts
interface OilStroke {
  x: number; y: number;   // centre, display coords
  angle: number;          // radians — along the form (⊥ to image gradient)
  length: number;         // px
  width: number;          // brush diameter px
  color: string;          // sampled base colour
  layer: number;          // 0 = coarse block-in … N = fine/accent; drives ORDER + TIMING + BRISTLE COUNT
}

interface DrawingPlan {
  width: number; height: number;
  strokePaths: StrokePath[];   // Phase-1 line sketch (reused)
  oilStrokes: OilStroke[];     // ordered coarse→fine; replaces brushStrokes
  colorImage: string;          // glaze source only; not painted unless photoGlaze > 0
  timing: {
    outlineMs: number; blockInMs: number; refineMs: number; accentMs: number;
    photoGlaze: number;        // 0..1, default 0
  };
}
```
The single `layer` field is the elegant lever: coarse→fine ordering, per-phase timing, and browser
bristle count all fall out of the data. Intelligence lives in the plan; the performer stays dumb.

**Server modules (Engine 1):**
- `lib/engine1/oilStrokes.ts` — replaces `brushStrokes.ts`: orientation field, multi-pass detail-driven
  density, face-box boost, emits ordered `OilStroke[]`.
- `lib/engine1/faceBox.ts` — **new, server-only**: locates the face in the *generated* portrait, returns
  `{ box, eyesMouth? }` or `null`. On miss/error → `null` and derivation proceeds pure-detail-driven.
  **This is the non-blocking fallback, in the server layer.**
- `generationService.ts` — assembles the v2 plan (drops shading derivation; `deriveShading*` retired in M5).

---

## 3. Stroke derivation (server-side)

**1. Orientation field.** Downsample to a ~200px working grid; Sobel luminance gradient; smooth via a
small **structure tensor** so orientation is coherent (not pixel-jittery). Per cell: gradient **magnitude**
("how much detail here") and **tangent angle** (⊥ to gradient = along the form). Flat cells (mag ≈ 0) get
a gentle default angle so block-in strokes don't spin.

**2. Detail-driven density, coarse→fine layers.** Each layer lays strokes on a jittered grid; finer layers
keep a stroke only where local magnitude clears a rising threshold.

| Layer | Brush | Gate | Role |
|---|---|---|---|
| 0 — block-in | large (~6% width) | none (covers all) | broad colour masses |
| 1 — forms | medium | mag > low | midtones, major shapes |
| 2 — detail | small | mag > mid (**+face-box boost**) | features, texture |
| 3 — fine | very small | mag > high (**+face-box boost**) | edges, fine structure |
| **4 — eyes/mouth** | **smallest, densest** | **only inside eyes/mouth sub-region** | **dedicated likeness pass** |
| 5 — accents | small, dark | very low luminance + high mag | darkest darks, "pen" bite |

**3. Face targeting — two DISTINCT effects.**
- `faceBox.ts` → `{ box, eyesMouth? }` for the *generated* portrait, or `null`.
- **Box → density boost:** inside `box`, Layers 2–3 lower their magnitude gate (more, smaller strokes).
- **`eyesMouth` → dedicated Layer 4 pass:** a *separate* pass — smallest brush, tightest spacing, highest
  density — that exists **only** here. This is **not** "box density × k"; it is its own layer because
  crisp eyes and mouth-line are what make the person recognisable. The eyes/mouth sub-region is spanned
  from BlazeFace's **coarse keypoints** (eyes, nose, mouth); we do **not** expect or use precise lid/lip
  contours — coarse points are exactly enough to define the sub-region box.
- **Fallbacks (never block):** no `eyesMouth` → skip Layer 4, keep Layers 2–3 boost. `faceBox === null`
  → all gates fall back to pure magnitude. The plan is always valid and non-empty.

**4. Stroke params & ordering.**
- Per stroke: `angle` from the field; `length` ∝ brush size; `width` per layer; `color` sampled at centre
  with a small **seeded** ±jitter (deterministic → stable tests + reproducible plan). Bristle tracks are
  **not** baked in — the browser derives bristle count from `width`+`layer` (compact plan).
- **Order = `layer` ascending**; within a layer, grouped by colour cluster then locality (serpentine
  sweep) so it reads as "work the big masses, then tighten the face." Layer 5 accents land last.
- **Budget:** ~2–4k strokes total, scaled to canvas area; tunable.

---

## 4. Choreography & rendering (Engine 2, Canvas 2D)

### Timeline (default ~22s; all in `timing`)
| Phase | Layers | ~Time | Tool | Beat |
|---|---|---|---|---|
| 1 · Sketch | `strokePaths` | 3.0s | pencil | Gesture lines self-draw (reused). |
| 2 · Block-in | 0 | 5.0s | **big brush** | Fast broad colour masses — the satisfying fill. |
| 3 · Refine | 1 → 4 | 11.0s | brush **shrinks per layer** | Brisk through 1–3, then **decelerates** for the Layer-4 eyes/mouth climax — likeness snaps into focus. |
| 4 · Accents | 5 | 3.0s | **pen / fine dark** | Deliberate, punchy darks; hand then lifts away. |

`timing = { outlineMs:3000, blockInMs:5000, refineMs:11000, accentMs:3000, photoGlaze:0 }`.
Inside `refineMs`, time splits across Layers 1–3 by stroke count, with a **fixed slow tail reserved for
Layer 4** so a detail-heavy image (e.g. a stadium crowd) can never starve the face climax — same logic as
the face box protecting the stroke budget.

**Shaped pacing, not monotonic accelerate:** fast fill → brisk detail → **slow careful face** → punchy
accents. Speeding through the eyes would blur the one moment that sells identity.

### Rendering — three stacked layers
```
┌ hand/tool layer   <img>/sprite — floats on top, moves; NEVER drawn onto the painting
├ painting bitmap   <canvas> — persistent accumulating painting (THIS is the souvenir)
└ sketch layer      <svg> — Phase-1 line strokes; fades under the paint
```
**The souvenir is clean by construction:** export is `paintingCanvas.toBlob()`, which reads only the bitmap.
The hand and SVG sketch are sibling DOM nodes, never in that canvas — no end-of-animation cleanup can be
forgotten. We still lift the hand off-screen on the last accent so the live final frame matches the export.

- **A. `OilStroke` → bristles (browser):** draw `n` parallel offset sub-lines across `width` (`n` from
  `width`+`layer`), colour-shifted light→dark across the brush (bristle furrows) + a half-opacity highlight
  ridge (impasto) + small per-stroke colour jitter; round caps, along `angle` over `length`. (Prototyped &
  validated in the companion demo's `paint()`.)
- **B. Texture:** toned ground fill + faint canvas-weave drawn **once** under everything. Brush texture is
  free from the bristle rendering; surface texture is this single static underlay. No per-frame cost.
- **C. Performance:** ~2–4k strokes, each painted **once**; ≈2–4 new strokes/frame at 60fps. `getTotalLength`/
  `getPointAtLength` used only for the few Phase-1 SVG paths, never in the oil hot-path. Budget scales with
  *total* strokes, not strokes². **WebGL stays in reserve** as a pure perf lever (trigger: ~8k+ strokes with
  heavy bristles, e.g. a future 4K kiosk) — not a separate architecture, not needed now.
- **D. Hand & tool:** hand rides the active stroke (centre + `angle` + `length` → start/end). Tool sprite
  swaps per phase (pencil → big → medium → fine → pen) and scales with `width` (reusing the existing
  "tool grows on switch" flourish) so the viewer *sees* the brush change.

### E. Resolution & the taint caveat
- Render the bitmap at `devicePixelRatio` (capped ≤2×) for crisp strokes; export at that resolution via
  `toBlob`. **Render resolution (perf-driven, ≤2×) and export resolution are conceptually separate.**
  *Now:* live bitmap = souvenir, one resolution. *Deferred (clean upgrade, no engine change):* because
  `OilStroke[]` is resolution-independent data, a print-quality souvenir is just a repaint of the same
  stroke list scaled N× onto one offscreen canvas in a single non-animated pass. A starting choice, not a lid.
- **Taint coupling:** `photoGlaze > 0` → `drawImage` the cross-origin fal portrait → **tainted canvas** →
  `toBlob` throws. So glaze-on and a downloadable souvenir are mutually exclusive without provider CORS — a
  third independent reason `photoGlaze` stays a default-0 emergency dial: it silently trades away the download.

---

## 5. Testing & milestones

**Testing (Vitest; deterministic derivation):**
- `oilStrokes.ts`: orientation on a synthetic gradient → known angles; density gating (flat vs. busy →
  stroke-count ratio); ordering invariant (sorted by `layer`); face-box boost (with/without box → more face
  strokes); **Layer 4 present iff `eyesMouth` present**; `faceBox === null` → valid non-empty plan (fallback).
- `faceBox.ts`: mock the detector; test the **seam** (miss/throw → `null`). The model is not unit-tested.
- Engine-2 scheduler (successor to `performanceScheduler`): pure `(timing, per-layer counts, elapsed)` →
  strokes-due + phase + hand target. Assert phase boundaries, **monotonic non-decreasing reveal**, and the
  **fixed Layer-4 slow tail** (face-climax time constant regardless of crowd stroke count).
- `DrawingPerformance`: jsdom — `getContext` may be null (existing guard) → no throw, calls `onDone`.
- **Look** is validated visually via a dev harness running the real engine on a static fixture image.

**Milestones — risk-sorted, decoupled-first:**

| # | Milestone | Rationale |
|---|---|---|
| M0 | v2 types + scheduler (pure logic + tests) | Foundation, no visuals |
| **M1** | **Engine 2 renderer on a STATIC fixture plan** — accumulating bitmap, bristles, texture, hand/tool | Riskiest piece (the *look*) first, fully decoupled from AI — the core strategic constraint |
| M2 | `oilStrokes.ts` (field, layers, density, ordering) → wire into `generationService`; **mock mode** emits a real v2 plan, zero cost | End-to-end on the free fixture |
| M3 | Face targeting: `faceBox.ts` + BlazeFace + box-boost + Layer-4 eyes/mouth + fallback | Likeness on a working base |
| M4 | Choreography polish: shaped pacing, tool swaps, slow face climax, accents | Tuning |
| M5 | Cleanup: delete `shadingLayer`/blend paths, export painted canvas in `ResultView`, retire `brushStrokes.ts`/`deriveShading*`, update tests | Old engine keeps working until the new one is proven |

---

## 6. Resolved decisions & out of scope

**Resolved (no open questions remain):**
- **Face detector = BlazeFace** via `onnxruntime-node` (server-side, behind the fallback seam). Full
  facial-landmark libraries (e.g. face-api) were explicitly rejected as overkill for the time budget;
  BlazeFace's coarse keypoints (eyes, nose, mouth) are exactly enough to span the Layer-4 sub-region.
- **Souvenir resolution:** live bitmap = souvenir, one resolution now; higher-res repaint deferred (clean,
  isolated, no engine change). Deliberate, recorded.
- **Phase-1 outline:** keep the existing potrace SVG line sketch (consciously the one retained piece of
  the old pipeline).

**Out of scope (future, logged elsewhere):** other vibes; multi-person; print/physical fulfillment;
the higher-res print export; any neural stroke-planning; WebGL renderer.
