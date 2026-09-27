import { ENV } from "../_core/env";

type ThreeDInput = {
  prompt: string;
  conceptUrl?: string;
  polygonCount?: string;
  textureQuality?: string;
};

export type ThreeDJob = {
  provider: string;
  jobId: string;
  modelUrl?: string;
  status: "queued" | "completed";
};

export interface ThreeDProvider {
  readonly id: string;
  generate(input: ThreeDInput): Promise<ThreeDJob>;
}

class HttpThreeDProvider implements ThreeDProvider {
  readonly id = "http-3d-provider";

  constructor(private readonly endpoint: string, private readonly apiKey: string) {}

  async generate(input: ThreeDInput): Promise<ThreeDJob> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(input),
    });
    const detail = await response.text();
    if (!response.ok) {
      throw new Error(`3D provider failed (${response.status}): ${detail || response.statusText}`);
    }
    const parsed = JSON.parse(detail) as Partial<ThreeDJob>;
    if (!parsed.jobId) throw new Error("3D provider returned no jobId");
    return {
      provider: this.id,
      jobId: parsed.jobId,
      modelUrl: parsed.modelUrl,
      status: parsed.status === "completed" ? "completed" : "queued",
    };
  }
}

export function getThreeDProvider(): ThreeDProvider | null {
  const endpoint = process.env.THREE_D_PROVIDER_URL;
  const apiKey = process.env.THREE_D_PROVIDER_API_KEY;
  if (!endpoint || !apiKey) return null;
  return new HttpThreeDProvider(endpoint, apiKey);
}

export function getProviderStatus() {
  return {
    image: { id: "forge-image-service", configured: Boolean(ENV.forgeApiUrl && ENV.forgeApiKey) },
    threeD: {
      id: process.env.THREE_D_PROVIDER_NAME || "http-3d-provider",
      configured: Boolean(process.env.THREE_D_PROVIDER_URL && process.env.THREE_D_PROVIDER_API_KEY),
    },
    note: "A geração 3D nunca é simulada: sem provider configurado, a interface bloqueia a ação e exibe a configuração necessária.",
  };
}
