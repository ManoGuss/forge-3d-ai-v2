import { ENV } from "../_core/env";

type ThreeDInput = { prompt: string; conceptUrl?: string; polygonCount?: string; textureQuality?: string };
export type ThreeDJob = { provider: string; jobId: string; modelUrl?: string; status: "queued" | "processing" | "completed" | "failed" | "cancelled"; progress?: number; stage?: string; error?: string };

export interface ThreeDProvider { readonly id: string; generate(input: ThreeDInput): Promise<ThreeDJob>; getStatus(jobId: string): Promise<ThreeDJob>; cancel(jobId: string): Promise<ThreeDJob>; }

class HttpThreeDProvider implements ThreeDProvider {
  readonly id = "http-3d-provider";
  constructor(private readonly endpoint: string, private readonly apiKey: string) {}
  private headers() { return { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${this.apiKey}` }; }
  async generate(input: ThreeDInput): Promise<ThreeDJob> {
    const response = await fetch(this.endpoint, { method: "POST", headers: this.headers(), body: JSON.stringify(input) });
    const detail = await response.text();
    if (!response.ok) throw new Error(`3D provider failed (${response.status}): ${detail || response.statusText}`);
    const parsed = JSON.parse(detail) as Partial<ThreeDJob>;
    if (!parsed.jobId) throw new Error("3D provider returned no jobId");
    return { provider: this.id, jobId: parsed.jobId, modelUrl: parsed.modelUrl, status: parsed.status ?? "queued", progress: parsed.progress ?? 4, stage: parsed.stage ?? "Job accepted" };
  }
  async getStatus(jobId: string): Promise<ThreeDJob> {
    const response = await fetch(`${this.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(jobId)}`, { method: "GET", headers: this.headers() });
    const detail = await response.text();
    if (!response.ok) throw new Error(`3D status failed (${response.status}): ${detail || response.statusText}`);
    const parsed = JSON.parse(detail) as Partial<ThreeDJob>;
    return { provider: this.id, jobId, modelUrl: parsed.modelUrl, status: parsed.status ?? "processing", progress: parsed.progress ?? 50, stage: parsed.stage ?? "Processing geometry", error: parsed.error };
  }
  async cancel(jobId: string): Promise<ThreeDJob> {
    const response = await fetch(`${this.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(jobId)}`, { method: "DELETE", headers: this.headers() });
    const detail = await response.text();
    if (!response.ok) throw new Error(`3D cancel failed (${response.status}): ${detail || response.statusText}`);
    const parsed = JSON.parse(detail || "{}") as Partial<ThreeDJob>;
    return { provider: this.id, jobId, status: "cancelled", progress: parsed.progress ?? 0, stage: parsed.stage ?? "Cancelled" };
  }
}

export function getThreeDProvider(): ThreeDProvider | null {
  const endpoint = process.env.THREE_D_PROVIDER_URL;
  const apiKey = process.env.THREE_D_PROVIDER_API_KEY;
  return endpoint && apiKey ? new HttpThreeDProvider(endpoint, apiKey) : null;
}

export function getProviderStatus() {
  return { image: { id: "forge-image-service", configured: Boolean(ENV.forgeApiUrl && ENV.forgeApiKey) }, threeD: { id: process.env.THREE_D_PROVIDER_NAME || "http-3d-provider", configured: Boolean(process.env.THREE_D_PROVIDER_URL && process.env.THREE_D_PROVIDER_API_KEY) }, note: "A geração 3D nunca é simulada: sem provider configurado, a interface bloqueia a ação e exibe a configuração necessária." };
}
