<div align="center">
  <img src="public/hand.svg" alt="VibeArtist logo" width="120" />
  <h1>VibeArtist</h1>
  <p><b>Watch an artist draw you — in seconds.</b><br/>A kiosk web app that turns a photo into an artistic portrait and animates it being drawn, stroke by stroke.</p>
  <p>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
    <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs">
    <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript">
    <img alt="ONNX Runtime" src="https://img.shields.io/badge/ONNX%20Runtime-BlazeFace-005ceb?logo=onnx">
    <img alt="Tested with Vitest" src="https://img.shields.io/badge/tested%20with-Vitest-6e9f18?logo=vitest">
  </p>
</div>

---

VibeArtist (internal name **DrawMyAI**) is a kiosk-style Next.js app for events and installations. A visitor
takes a photo, picks a vibe, and the app generates an artistic portrait — then replays it as if an artist
were drawing and painting it live: line-art strokes first, then oil-brush passes that build up the image.

The whole pipeline is built to degrade gracefully: with no image API configured it runs in **mock mode**
against a built-in fixture portrait, so you can develop and demo the full flow without any keys or cost.

## Features

- **Kiosk flow** — a guided start → capture → vibe → easel → result sequence, with an idle auto-reset so
  the app returns to the start screen between visitors.
- **On-device face detection** — a BlazeFace ONNX model (via `onnxruntime-node`) locates the face to
  sharpen the eyes/mouth pass; it falls back cleanly to a pure detail-driven path if detection fails.
- **Line-art tracing** — vectorized outlines via `potrace` and `jimp` feed the first drawing pass.
- **Oil-brush stroke engine** — an orientation-field-driven brush with a scheduler that orders strokes so
  the portrait fills in the way a painter would build it, layer by layer.
- **Pluggable portrait generation** — a `/api/generate` route pre-wired for [fal.ai](https://fal.ai)
  FLUX PuLID (identity-preserving portraits), with support for both synchronous and async/queue endpoints.
- **Mock mode by default** — runs against a fixture portrait until you supply an API key.
- **Well tested** — Vitest coverage across the flow, drawing engine, face box, line-art and generation
  service.

## Tech stack

| Area              | Technology                                                     |
|-------------------|----------------------------------------------------------------|
| Framework         | Next.js 16 (App Router), React 19, TypeScript 5                |
| Styling           | Tailwind CSS v4                                                 |
| Face detection    | `onnxruntime-node` + BlazeFace ONNX model                      |
| Image processing  | `potrace` (tracing), `jimp` (raster)                           |
| Portrait API      | fal.ai FLUX PuLID (configurable, optional)                     |
| Testing           | Vitest, Testing Library, jsdom                                 |

## Getting started

### Prerequisites

- Node.js 18+ and a package manager (npm, pnpm or yarn)

### Install and run

```bash
npm install
npm run dev        # start the dev server at http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # run ESLint
npm test           # run the Vitest suite (npm run test:watch for watch mode)
```

Append `?kiosk=1` to the URL to enable kiosk mode (idle auto-reset). A developer sandbox for the oil-brush
engine is available at `/dev/oil`.

### Environment variables

The app runs in **mock mode** out of the box. To switch on real, face-preserving portrait generation, copy
`.env.example` and fill in your fal.ai key:

```bash
# Pre-wired for fal.ai FLUX PuLID (identity-preserving portrait).
# Create a key at https://fal.ai/dashboard/keys
PORTRAIT_API_URL=https://fal.run/fal-ai/flux-pulid
PORTRAIT_API_KEY=            # your fal.ai key — stays server-side only

# Async (queue) providers only — leave unset for the default synchronous endpoint.
# PORTRAIT_API_POLL=1
# PORTRAIT_API_POLL_INTERVAL_MS=1500
# PORTRAIT_API_POLL_TIMEOUT_MS=60000

# Face detection runs by default; set to 0 to force it off.
# PORTRAIT_FACE_DETECT=0
```

With `PORTRAIT_API_URL` unset the `/api/generate` route serves the fixture portrait; set both `URL` and
`KEY` to call the real API. Keys are only ever read on the server.

## License

Released under the [MIT License](LICENSE) © 2026 Olivier Lüthy. You're free to use, modify and distribute this
software, including commercially, as long as the copyright notice and license are included.

## Author

Built by **Olivier Lüthy** — [GitHub](https://github.com/olivierluethy).
