# AI Providers

## Provider boundaries

Forge keeps provider-specific code behind small server-only adapters:

- `ImageProvider` — currently backed by `server/_core/imageGeneration.ts` and Forge Image Service.
- `ThreeDProvider` — currently implemented as `HttpThreeDProvider` in `server/providers/threeD.ts`.
- Future boundaries: `AnimationProvider`, `AudioProvider`, `RiggingProvider`.

## Concept generation

`forge.generateConcept` receives the explicit prompt, selected style and up to six reference images. The server appends production-oriented instructions without replacing the user's intent, then sends the request to the configured image service.

The server stores the returned concept URL in the generation history when the database is available.

## 3D provider contract

Configure `THREE_D_PROVIDER_URL` and `THREE_D_PROVIDER_API_KEY`. The endpoint should accept:

```json
{
  "prompt": "...",
  "conceptUrl": "/manus-storage/...",
  "polygonCount": "20K",
  "textureQuality": "High"
}
```

It should return:

```json
{
  "provider": "optional-provider-name",
  "jobId": "provider-job-id",
  "status": "queued | completed",
  "modelUrl": "optional-completed-model-url"
}
```

The UI only marks the job as queued after the provider accepts the request. A missing provider produces `PRECONDITION_FAILED`; it never manufactures a placeholder model.

## Adding a new provider

1. Implement `ThreeDProvider` in `server/providers/`.
2. Select it in `getThreeDProvider()` using a server-only environment variable.
3. Normalize provider responses to `ThreeDJob`.
4. Add tests for accepted jobs, provider errors and missing credentials.
5. Add polling as a server procedure once the provider exposes job status.
