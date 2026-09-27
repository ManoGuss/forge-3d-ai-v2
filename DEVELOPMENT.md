# Development roadmap

## Phase 1 — current

- Project shell and generation thread foundation.
- Prompt, style, doodle, image references and managed uploads.
- Built-in image concept generation.
- Provider boundary for real 3D generation.
- Three.js viewport with camera, lighting, materials and wireframe.
- GLB import/export.

## Phase 2

- Persist reference rows against generation IDs.
- Generation polling and retry states.
- Material inspector, gizmos, scene tree, variants, versioning and asset library.
- Asset Pack region selection and per-object conversion.

## Phase 3

- Rigging provider and skeleton visualization.
- Animation search/generation, timeline and video-to-animation.
- Audio attachments, spatial audio, physics and particles.

## Phase 4

- Engine export profiles, world playtest, AI code assistant and collaboration.

## Rules

- Keep provider keys server-side.
- Do not use mock generations as final results.
- Prefer typed tRPC procedures over ad-hoc REST endpoints.
- Keep each feature modular and covered by a contract test.
- Show progress only when backed by a real request/job state.
