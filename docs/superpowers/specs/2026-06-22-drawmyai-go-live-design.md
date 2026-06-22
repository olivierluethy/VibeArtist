# DrawMyAI — "Go Live" Design Note (provider-agnostic pieces)

**Date:** 2026-06-22
**Status:** Approved (extends the v1 spec)
**Goal:** Make real-mode work with a typical face-preserving image API, without committing to one provider yet. Implements the provider-agnostic pieces; the final provider hookup (auth + exact field names + a real key) is a later, small step.

## Why this is needed
Real image APIs differ from the v1 adapter's assumption in two ways:
1. They return **one finished portrait**, not a portrait + line-art pair. The line-art is what the pencil "draws," so we must **derive it ourselves**.
2. Many are **asynchronous** — submit a job, then poll a status endpoint until the image is ready.

## Decisions (approved)
- **Derive line-art locally** from the generated portrait (edge-detection), plus a grayscale **shading** layer. One generation, provider-agnostic, full control of the sketch look.
- **Async via a generic poll utility** with timeout; the synchronous (immediate-result) path short-circuits so "wait-style" providers (e.g. Replicate `Prefer: wait`) need no polling.
- **Provider:** Replicate leaning (largest identity-preserving catalog), fal.ai runner-up. Chosen later; only `realPortraitEngine.ts` changes.

## Piece A — Local line-art + shading derivation
- `PortraitOutput` becomes `{ colorImage: string; width: number; height: number }` (drop `lineArtImage`).
- New `lib/engine1/derive.ts`:
  - `loadImageBuffer(src)` — shared loader for `data:` URIs and `http(s)` URLs (moved here; `lineart.ts` reuses it).
  - `deriveLineArt(colorSrc): Promise<string>` — grayscale → edge-detect → threshold → PNG data URL (traceable, and shown as the sketch).
  - `deriveShading(colorSrc): Promise<string>` — grayscale PNG data URL (the shade phase).
- `generationService.generateDrawingPlan`: `out = engine.generate()` → `lineArt = deriveLineArt(out.colorImage)` → `strokePaths = traceToStrokePaths(lineArt)` → `shadingLayer = deriveShading(out.colorImage)` → assemble plan.
- Update `realPortraitEngine.ts` (return one image), `route.ts`, and the existing tests (`generationService.test.ts`, `realMode.integration.test.ts`) to the one-image contract.

## Piece B — Async job polling
- New `lib/engine1/poll.ts`: `submitAndPoll(submit, cfg)` where `cfg = { isDone, isFailed?, getPollUrl, getResult, intervalMs, timeoutMs }`. Generic, unit-tested with stubbed fetch and a fake clock.
- `realPortraitEngine.ts`: after the initial POST, if the response indicates a pending job (configurable status field — the provider seam), poll via `submitAndPoll`; otherwise use the immediate result. Throw on timeout/failure (surfaces as the route 500 → friendly retry).

## Out of scope (later)
- The real provider's exact request/response field names, auth scheme, and a live API key.
- Streaming/partial previews; retries/backoff beyond a simple interval.

## Testing
- `deriveLineArt`/`deriveShading`: feed a small synthetic PNG, assert a PNG data URL out and (for line-art) that tracing yields ≥1 stroke.
- `generationService` + `realMode.integration`: provider returns ONE portrait (URL to a real PNG); assert the plan has real stroke paths derived locally.
- `submitAndPoll`: stubbed fetch returning pending→pending→done; assert it polls and returns the result; assert timeout throws.
