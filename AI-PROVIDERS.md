# AI Providers

## Provider boundaries

Forge keeps provider-specific code behind server-only adapters:

- `ImageProvider` — backed by `server/_core/imageGeneration.ts` and Forge Image Service.
- `ThreeDProvider` — selected by `getThreeDProvider()` in `server/providers/threeD.ts`.
- Future boundaries: `AnimationProvider`, `AudioProvider`, `RiggingProvider`.

## Real 3D provider: Tripo v3

The default provider is **Tripo v3** when `TRIPO_API_KEY` is configured as a server secret. The integration uses the documented official endpoints:

- `POST /v3/generation/text-to-model` for prompt-only generation.
- `POST /v3/generation/image-to-model` for concept/reference generation.
- `GET /v3/tasks/{task_id}` for asynchronous polling.
- `GET /v3/account/balance` for credential health checks.

The backend normalizes Tripo's `task_id`, `queued/running/success/failed/cancelled` states and `output.model_url` into the internal `ThreeDJob` contract. When a task succeeds, the server downloads the temporary Tripo GLB immediately and stores it with `storagePut()` under `models/tripo/`, so the viewer does not depend on Tripo's expiring URL.

Configure only on the server:

```text
TRIPO_API_KEY=...
TRIPO_DEFAULT_MODEL=v3.1-20260211   # optional
THREE_D_DEFAULT_PROVIDER=tripo      # optional; defaults to tripo
```

Never put `TRIPO_API_KEY` in `VITE_*` variables or client code. The browser calls our tRPC backend; only the backend calls Tripo.

## Input mapping

The `forge.generate3D` procedure accepts:

```json
{
  "prompt": "structured or user-authored 3D description",
  "conceptUrl": "https://... or /manus-storage/...",
  "polygonCount": "20K",
  "textureQuality": "High"
}
```

- With `conceptUrl`, the server uses Tripo image-to-model and passes the prompt as additional guidance.
- Without `conceptUrl`, the server uses Tripo text-to-model.
- Polygon strings are normalized to a safe `face_limit` range.
- Texture quality is normalized to Tripo's documented `fast`, `standard`, `detailed` or `extreme` values.

## Fallback and safety

The legacy `THREE_D_PROVIDER_URL` + `THREE_D_PROVIDER_API_KEY` adapter remains available as a compatibility fallback when Tripo is not selected. No provider configured means `PRECONDITION_FAILED`; the application never fabricates a model or placeholder success.

Tripo v3 does not expose a documented cancellation endpoint in the current task lifecycle API. The UI therefore reports cancellation failures honestly instead of pretending a task was cancelled.

## Tests

- `server/providers/threeD.credentials.test.ts` calls the lightweight official balance endpoint without logging or exposing the key.
- `server/forge.test.ts` verifies readiness and the no-fake-generation guard.
- Run `pnpm check && pnpm test && pnpm build` before delivery.
