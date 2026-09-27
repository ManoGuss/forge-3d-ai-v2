# Forge 3D AI

**Forge 3D AI** is an AI 3D Creation Studio foundation: idea, prompt, doodle and references flow into a real concept-generation service and a real WebGL viewport.

## What is implemented

- Dark, desktop-first creation workspace with responsive mobile navigation.
- Project creation persisted through tRPC + Drizzle when the database is available.
- Prompt + style direction + multiple image references + doodle canvas.
- Real reference upload to managed storage.
- Real concept generation through the configured Forge Image Service.
- Provider abstraction for future 3D engines; no fake model is returned when a provider is missing.
- WebGL viewport built with React Three Fiber and Three.js.
- Orbit camera, pan, zoom, environment presets, key light, PBR color and wireframe mode.
- Local GLB export through `GLTFExporter`.
- GLB/GLTF import for inspecting an existing asset.
- Explicit Phase 2 placeholders for rigging, animation, variants and refinement.

## Stack

- React 19 + TypeScript + Tailwind 4
- Express + tRPC 11
- Drizzle ORM + MySQL/TiDB
- Three.js + React Three Fiber + Drei
- Manus OAuth and managed storage

## Run locally

```bash
pnpm install
pnpm dev
```

## Environment

The WebDev runtime provides the built-in variables documented in the project template. The image provider uses:

- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`

To enable a real 3D generation backend, configure server-only variables:

- `THREE_D_PROVIDER_URL` — HTTPS endpoint that accepts `{ prompt, conceptUrl, polygonCount, textureQuality }`.
- `THREE_D_PROVIDER_API_KEY` — secret bearer token.
- `THREE_D_PROVIDER_NAME` — optional display name.

API keys are read only on the server and are never sent to the browser.

## Quality gates

```bash
pnpm check
pnpm test
pnpm build
```

## Architecture

- `client/src/pages/Home.tsx` — studio composition and interaction state.
- `client/src/components/forge/ForgeViewport.tsx` — real WebGL scene and GLB export.
- `client/src/components/forge/DoodleCanvas.tsx` — pointer-based drawing canvas.
- `server/routers.ts` — tRPC contracts for projects, uploads and generation.
- `server/providers/threeD.ts` — swappable 3D provider boundary.
- `server/_core/imageGeneration.ts` — built-in image provider adapter.
- `server/db.ts` + `drizzle/schema.ts` — persistence.

See `AI-PROVIDERS.md`, `EXPORT.md` and `DEVELOPMENT.md` for the next integration steps.
