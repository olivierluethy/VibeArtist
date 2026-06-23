# DrawMyAI — Project Status & Handoff

> **Purpose of this file:** a single, always-current snapshot of where DrawMyAI is, so anyone
> (including a fresh AI session) can read this one file and immediately understand the project,
> what's done, what's left, and exactly how to do the next step.
>
> **Last updated:** 2026-06-23 · **Branch:** `master` · **Tests:** 39 passing (16 files) · **Build:** clean
>
> **Latest:** provider adapter is now **pre-wired for fal.ai FLUX PuLID** (see §6). Only a live
> fal API key + a prompt-tuning pass remain before real portraits generate.

---

## 1. What DrawMyAI is (in one paragraph)

A web app (also deployable as a fullscreen **kiosk**) that recreates the *spectacle* of a street
portrait artist. You capture a face in ~10s (or upload a photo), pick a **vibe**, and an AI portrait
"draws itself" stroke-by-stroke on a warm gallery easel — pencil outline → shading → accelerating
color flood, with a moving hand. The **performance is the product; the portrait is the souvenir.**

**The key design insight:** it is **generate-then-perform** — Engine 1 generates a finished portrait,
then Engine 2 *choreographs* a complete A→Z drawing of that pre-made image. It is **NOT** live model
denoising (that looks like "blur resolving into focus" and kills the magic).

**v1 scope is deliberately narrow:** the **World Cup** vibe only, done excellently. Light
customization = pick a team + an optional player. Other vibes are future roadmap.

---

## 2. Architecture — two engines + one handoff

```
selfie + team + (optional) player
          │
  ENGINE 1 (server, ~5s)                ENGINE 2 (browser, the show ~40s)
  1. generate portrait (image API)      consumes the Drawing Plan:
  2. derive line-art locally  ───────►  outline (self-drawing SVG strokes)
  3. trace line-art → SVG strokes         → shading sweep
  4. derive shading layer                 → accelerating color flood
          │                               + hand sprite riding the stroke
          ▼
   DRAWING PLAN = {
     strokePaths, shadingLayer,
     colorImage, timing
   }
```

The **Drawing Plan** is the clean boundary: Engine 2 was built and tested in full isolation against a
hand-authored fixture plan *before* any AI existed. That de-risked the hardest part first.

**Tech stack:** Next.js (App Router) · TypeScript (strict) · Tailwind · Vitest · `potrace` (raster→SVG)
· `jimp` (edge-detect/grayscale). Image-API keys are **server-side only**, never sent to the browser.

---

## 3. Where the code lives (map)

| Area | Path | Role |
|---|---|---|
| Engine 2 core (pure logic) | `lib/drawing/performanceScheduler.ts`, `types.ts` | Computes per-frame render state; the pacing math |
| Engine 2 view | `components/DrawingPerformance.tsx`, `EaselScreen.tsx` | Self-drawing easel + hand sprite |
| Fixture (mock art) | `lib/drawing/fixtures.ts` | World Cup Drawing Plan, zero AI/cost |
| App flow | `lib/flow.ts`, `app/page.tsx` | 6-screen state machine |
| Input | `components/InputStep.tsx`, `lib/face.ts` | Camera/upload + face-presence check + 1024px downscale |
| Vibe picker | `components/VibePicker.tsx`, `lib/teams.ts` | Team + optional player |
| Result | `components/ResultView.tsx`, `lib/share.ts` | Download + share |
| **Engine 1 (server)** | `lib/engine1/` | Generation service + provider adapter (see §6) |
| API route | `app/api/generate/route.ts` | `POST /api/generate` → Drawing Plan; mock-vs-real switch; `runtime='nodejs'` |

### Engine 1 internals (`lib/engine1/`)
- `portraitEngine.ts` — `PortraitInput`/`PortraitOutput` types, `PortraitEngine` interface, `buildPrompt()`.
- `generationService.ts` — `generateDrawingPlan()`: calls the engine, fetches the portrait **once**, derives line-art + shading from that one buffer, traces strokes, assembles the plan.
- `derive.ts` — `deriveLineArt*` / `deriveShading*` (local edge-detect + grayscale).
- `imageSource.ts` — `loadImageBuffer()`: shared loader for `data:` URIs and `http(s)` URLs.
- `lineart.ts` — `traceToStrokePaths()` via potrace.
- `poll.ts` — generic `pollUntilDone()` for async image jobs.
- **`realPortraitEngine.ts`** — the provider adapter. **This is the one file the go-live step touches.**

---

## 4. Build history (done & merged)

### World Cup v1 — COMPLETE (12 tasks, all reviewed clean)
- [x] Task 1 — Scaffold (Next.js + Tailwind + Vitest + warm "Gallery Easel" theme)
- [x] Task 2 — Drawing Plan types + performance scheduler (pacing math)
- [x] Task 3 — World Cup fixture Drawing Plan (synthetic art, zero AI)
- [x] Task 4 — `DrawingPerformance` (self-drawing easel + hand)
- [x] Task 5 — App flow state machine + easel screen (magic visible end-to-end)
- [x] Task 6 — Input: camera capture + upload + face-presence check
- [x] Task 7 — VibePicker: team + optional player
- [x] Task 8 — ResultView: download + share
- [x] Task 9 — Engine 1: PortraitEngine interface + GenerationService + tracing
- [x] Task 10 — `/api/generate` route + client wiring (mock-vs-real switch)
- [x] Task 11 — Provider-backed `RealPortraitEngine` adapter (env-configured)
- [x] Task 12 — Kiosk mode (camera default + idle reset)
- [x] Final review + real-mode hardening (URL line-art, node runtime, selfie downscale)

### Go-live provider-agnostic pieces — COMPLETE (merged ~2026-06-23)
- [x] **Piece A** — Derive line-art + shading **locally** from a single generated portrait.
      Provider now only needs to return ONE image: `PortraitOutput = { colorImage, width, height }`.
- [x] **Piece B** — Generic, tested async **polling** (`pollUntilDone`), opt-in via `PORTRAIT_API_POLL=1`.
      The synchronous (immediate-result) path is unchanged when the flag is off.

**Reference specs:**
`docs/superpowers/specs/2026-06-22-drawmyai-design.md` (v1) ·
`docs/superpowers/specs/2026-06-22-drawmyai-go-live-design.md` (go-live pieces) ·
`docs/superpowers/plans/2026-06-22-drawmyai-world-cup.md` (full v1 task plan).

---

## 5. How to run it today

```bash
npm install
npm run dev        # http://localhost:3000  — runs in MOCK mode (no keys, no cost)
npm test           # 39 tests, all passing
npm run build      # clean
```

**Mock mode** (default, no env set): the app uses the built-in World Cup fixture portrait. The full
flow — capture/upload → pick team → watch the draw → download/share — works end-to-end with zero cost.

---

## 6. ⏭️ GO-LIVE — provider adapter (pre-wired for fal.ai FLUX PuLID)

**Provider decision (2026-06-23):** **fal.ai**, model **FLUX PuLID**. Chosen over Replicate for
predictable per-portrait pricing and fast warm starts (Replicate's 30–90s cold starts at low traffic
would wreck the "preparing…" moment). FLUX PuLID over PhotoMaker because it takes a **single** reference
image (matches the one-selfie capture flow; PhotoMaker wants a ZIP of multiple images).

### ✅ DONE — adapter pre-wired (`lib/engine1/realPortraitEngine.ts`)
The adapter now speaks fal's exact contract, verified against fal's live OpenAPI schema:
- **Auth:** `Authorization: Key <token>` (fal's scheme — *not* `Bearer`).
- **Endpoint:** `https://fal.run/fal-ai/flux-pulid` (synchronous — blocks, returns the result; no polling).
- **Request body:** `{ reference_image_url: <selfie data URI>, prompt: buildPrompt(input), image_size: 'portrait_4_3' }`.
  fal confirmed `reference_image_url` accepts a base64 data URI, so the captured selfie needs no pre-upload.
- **Response map:** `json.images[0].url / .width / .height`.
- **Async fallback:** `PORTRAIT_API_POLL=1` still works for the `queue.fal.run` endpoint (poll seam updated
  for fal's `COMPLETED`/`FAILED` + `status_url` shape). Default sync path needs none of this.

Tests + `.env.example` updated to the fal shape; 39 tests pass, build clean.

### ⏳ REMAINING — needs the user's fal API key
1. **Create a fal account + key:** https://fal.ai/dashboard/keys
2. **Set env** (`.env.local`): `PORTRAIT_API_KEY=<key>` (URL is already defaulted in `.env.example`).
3. **Run one real generation** and check identity + style.
4. **Prompt-tuning pass (expected):** `buildPrompt()` currently asks for "pencil-and-ink … clean line art."
   Since the pencil/sketch look is derived **locally** from the color portrait, the model should produce a
   nice **finished colored illustration** instead — tune the prompt against real output (tune-by-feel, per
   the design). This needs real generations, so it's a key-in-hand step.

### Env vars (server-side only) — see `.env.example`
| Var | Purpose |
|---|---|
| `PORTRAIT_API_URL` | Provider endpoint. **Unset = mock mode.** Default: `https://fal.run/fal-ai/flux-pulid`. |
| `PORTRAIT_API_KEY` | fal API key (sent as `Key <token>`). |
| `PORTRAIT_API_POLL` | `1` to enable async job polling (only for the `queue.fal.run` endpoint). |
| `PORTRAIT_API_POLL_INTERVAL_MS` | Poll interval (default 1500). |
| `PORTRAIT_API_POLL_TIMEOUT_MS` | Poll timeout (default 60000). |

---

## 7. Roadmap (after go-live, logged — not started)

- More vibes: City (Paris bridge w/ partner), Anime (e.g. Attack on Titan), game skins (Fortnite),
  Comic Hero, Renaissance, Neon, Royal, Caricature.
- Multi-person composites · print ordering / physical fulfillment · accounts/payments/galleries.
- **IP/likeness note:** real-player likeness (e.g. Neymar) and franchises carry commercial IP
  considerations. Fine for a prototype; flagged so it's never a surprise.

---

## 8. Known deferred minors (acceptable for a prototype)

- `res.json()` provider response is cast to `PortraitOutput` unchecked (trusts provider shape).
- Line-art URL test asserts array-ness, not exact stroke count.
- A few extremely-unlikely canvas-null edges; per-frame `force()` re-render is unbounded.
- Edge-detect may yield few strokes on very flat/simple portraits (drawing still valid).

None block go-live.
