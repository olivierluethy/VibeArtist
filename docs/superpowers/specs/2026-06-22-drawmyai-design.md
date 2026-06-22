# DrawMyAI — Design Spec (v1)

**Date:** 2026-06-22
**Status:** Approved for planning
**Scope of this spec:** First realistic, sophisticated prototype of the core experience — the **World Cup** vibe only.

---

## 1. The Idea

Street portrait artists in tourist cities (Paris, Barcelona) draw tourists' faces. The real magic isn't the final drawing — it's the **performance**: people gather and watch a face appear stroke by stroke. But that magic is gated by painful constraints: long queues, the subject must sit still for 30+ minutes, the artist can be distracted, and you usually get one style (pencil).

**DrawMyAI keeps the performance and removes the constraints.** The subject's face is captured in ~10 seconds. They pick a *vibe*. Then an AI artist "draws" their portrait live on a virtual easel — pencil lines appearing as if by a real hand — while anyone can watch, start to finish. The performance is the product; the portrait is the souvenir.

### Core principle
The audience watches a **beautifully choreographed drawing of a finished result** — not the model literally thinking stroke-by-stroke. It *looks and feels* like a hand drawing live (the way whiteboard-animation and AI-art reveals work). This is stated plainly so it is never a surprise: the "drawing" is a deliberate performance layer on top of a pre-generated image.

---

## 2. v1 Scope (and what's deliberately out)

**In scope (v1):**
- One vibe only: **World Cup**, done excellently.
- Two input modes from one codebase: **capture** (camera) and **upload** (image file).
- Light customization: **pick your team/country**, and **optionally a player** to be drawn alongside.
- The signature **authentic pencil draw-on** performance on a warm "Gallery Easel" screen.
- A shareable/downloadable final portrait.
- Runs as a web app (online) and as a kiosk (same app, fullscreen) — the kiosk is a deployment target, not a separate product.

**Explicitly out of scope (future roadmap, not v1):**
- Other vibes (City / Paris bridge with a partner, Comic Hero, Anime e.g. Attack on Titan, game skins e.g. Fortnite, Renaissance, Neon, Royal, Caricature).
- Multi-person composites (you + partner in a scene).
- Print ordering / physical fulfillment.
- Accounts, payments, galleries, moderation dashboards.

**Known issue logged for later (NOT a v1 blocker):** real-player likeness (e.g. Neymar) and franchises (FIFA, Fortnite, Attack on Titan) carry IP/likeness considerations if the product goes commercial. Fine for a prototype that proves the magic; flagged so it is never a surprise.

---

## 3. Design Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Where it lives | Web app + kiosk, **one codebase** | Kiosk = same app fullscreen with a camera; online adds the upload option |
| Drawing method | **Generate-then-perform** | Only this approach gives a true, continuous A→Z drawing with full pacing control; live-generation looks like "blurry resolving into focus," which kills the excitement |
| Pacing | Slow & rich at the **start** (outline), **accelerate** through the predictable color fills | Matches where the excitement actually lives; keeps it from going flat |
| Draw screen aesthetic | **Gallery Easel** (warm, human, real-easel, moving hand) | Most emotionally distinctive; sells the "real street artist" fantasy |
| v1 vibe | **World Cup only** | Nail one experience before expanding |
| Customization depth | **Light** (team + optional player) | Personalization without drowning the user or slowing the show |
| Engine 2 fidelity | **Authentic pencil draw-on** | It *is* the product; worth doing right |
| Stack | **Next.js (React + TS) + Tailwind**, Vercel | Bundles secret-key handling + one-command deploy; kiosk runs the same app |

---

## 4. Architecture — Two Engines + One Handoff

The app is two engines connected by a single clean interface, the **Drawing Plan**.

```
 selfie + team + (optional) player
            │
   ┌────────▼──────────────────┐
   │  ENGINE 1 — server-side   │   fast, hidden (~5s target)
   │  1. generate portrait     │   (face-preserving image API)
   │  2. produce a line-art ver│
   │  3. trace line-art → SVG  │
   │  4. (opt) shading layer   │
   └────────┬──────────────────┘
            │
   DRAWING PLAN  = {
     strokePaths: SVG path[] (ordered, for self-drawing outline),
     shadingLayer: image (pencil shading),
     colorImage:  image (final full-color portrait),
     timing:      { outlineMs, shadeMs, colorMs, accelerate: true }
   }
            │
   ┌────────▼──────────────────┐
   │  ENGINE 2 — browser       │   the show (~40s on the easel)
   │  outline → shade → color  │
   │  + hand sprite on stroke  │
   └───────────────────────────┘
```

**Why the Drawing Plan is the key boundary:** Engine 2 (the magic) can be built and tested in complete isolation using a **hand-authored Drawing Plan** with static art — before Engine 1's AI works at all. This de-risks the hardest, most important part first.

---

## 5. Components (each: one purpose, clear interface)

### Client
- **`InputStep`** (`CameraCapture` + `ImageUpload`)
  - *Does:* obtains a single face photo, with a framing guide; camera on kiosk, camera-or-upload online.
  - *Out:* a photo Blob.
  - *Depends on:* browser camera API; nothing else.

- **`VibePicker`** (World Cup configuration)
  - *Does:* pick team/country (+ optional player).
  - *Out:* `{ team, player? }` config.

- **`PreparingView`**
  - *Does:* "the artist is preparing…" loader while Engine 1 runs; sets up the easel scene.

- **`DrawingPerformance`** (Engine 2 — the heart)
  - *Does:* consumes a Drawing Plan and performs it: self-drawing SVG outline → shading sweep → accelerating color flood → hand sprite riding the active stroke.
  - *In:* a Drawing Plan. *Out:* a "finished" event.
  - *Pure & testable:* given a fixed Drawing Plan it renders deterministically; no network dependency.

- **`ResultView`**
  - *Does:* reveal the framed portrait; download; share link. (Print = later.)

### Server
- **`GenerationService`** (Engine 1 orchestrator, API route)
  - *Does:* selfie + config → calls `PortraitEngineAdapter`, derives line-art, traces to SVG paths, assembles the Drawing Plan.
  - *Out:* a Drawing Plan (JSON + asset URLs/data).

- **`PortraitEngineAdapter`**
  - *Does:* wraps the chosen face-preserving image-gen API behind a stable interface (`generate(selfie, prompt) → image`).
  - *Why isolated:* provider is swappable; lets us change image models without touching anything else.

---

## 6. User Flow (6 screens)

1. **Start** — choose **Capture** or **Upload**.
2. **Get the photo** — ~10s, face-framing guide; confirm/retake.
3. **Pick your team** (+ optional player) — Light customization.
4. **Preparing** — Engine 1 runs hidden (~5s); easel scene assembles.
5. **The Performance** — Gallery Easel; pencil draws you live, A→Z, accelerating tail.
6. **Your portrait** — framed reveal → **download / share**.

---

## 7. Error Handling (kept simple)

| Situation | Behavior |
|---|---|
| Camera permission denied | Fall back to **upload** automatically |
| No face detected in photo | Friendly "let's try again" → retake/re-upload |
| Generation fails / times out | Retry with a calm message; never a raw error |
| Slow generation | `PreparingView` holds the moment; soft timeout then retry |
| Kiosk offline | Retry/queue; show a graceful "reconnecting" state |

---

## 8. Testing Strategy

- **Engine 2 first, in isolation:** build `DrawingPerformance` against **fixture Drawing Plans** (static, hand-authored art). Perfect the pencil feel before any AI exists. This is the priority and the de-risking move.
- **`PortraitEngineAdapter` mockable:** unit-test `GenerationService` with a fake adapter; no live API calls in tests.
- **Flow tests:** each screen transition (input → vibe → preparing → performance → result), including the error fallbacks (camera-denied → upload; no-face → retake).
- **Visual/manual:** the performance is inherently visual — manual review on both a phone (online) and a large fullscreen display (kiosk).

---

## 9. Build Order (informs the implementation plan)

1. **Engine 2 against fixtures** — the self-drawing easel performance with static art. The magic, de-risked first.
2. **App shell & flow** — the 6 screens, navigation, state, on dummy data.
3. **Input** — camera capture + upload, framing guide, face check.
4. **`PortraitEngineAdapter`** — wire one face-preserving image API behind the stable interface.
5. **`GenerationService`** — line-art derivation + SVG tracing → assemble real Drawing Plans.
6. **Join** — real Drawing Plans flow into Engine 2; pacing/polish pass.
7. **Result** — download + share.
8. **Kiosk pass** — fullscreen, camera-default, offline grace.

---

## 10. Open Questions (resolve during planning, not blockers)

- Which specific face-preserving image-gen API for the `PortraitEngineAdapter` (compared at build time; the adapter makes this swappable).
- Line-art: derive via a second image-model prompt vs. an edge/trace step — decide when wiring Engine 1.
- Exact performance length and pacing curve (tune by feel against fixtures).
