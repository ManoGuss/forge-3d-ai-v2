import { ENV } from "../_core/env";
import { storageGetSignedUrl, storagePut } from "../storage";

type ThreeDInput = {
  prompt: string;
  conceptUrl?: string;
  polygonCount?: string;
  textureQuality?: string;
};

type TripoTask = {
  task_id?: string;
  status?: string;
  progress?: number;
  output?: { model_url?: string; rendered_image_url?: string };
  message?: string;
  error?: string;
};

export type ThreeDJob = {
  provider: string;
  jobId: string;
  modelUrl?: string;
  thumbnailUrl?: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress?: number;
  stage?: string;
  error?: string;
};

export interface ThreeDProvider {
  readonly id: string;
  readonly configured: boolean;
  generate(input: ThreeDInput): Promise<ThreeDJob>;
  getStatus(jobId: string): Promise<ThreeDJob>;
  cancel(jobId: string): Promise<ThreeDJob>;
}

const TRIPO_BASE_URL = "https://openapi.tripo3d.ai/v3";

function polygonLimit(value?: string) {
  const parsed = Number.parseInt(value?.replace(/[^0-9]/g, "") ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20000;
  return Math.min(Math.max(parsed, 500), 1500000);
}

function textureQuality(value?: string): "fast" | "standard" | "detailed" | "extreme" {
  const normalized = value?.toLowerCase();
  if (normalized === "fast" || normalized === "detailed" || normalized === "extreme") return normalized;
  return "standard";
}

function providerError(response: Response, body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string; suggestion?: string };
    return `${parsed.message ?? response.statusText}${parsed.suggestion ? ` ${parsed.suggestion}` : ""}`.trim();
  } catch {
    return body || response.statusText;
  }
}

async function inputUrlForProvider(value?: string) {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  const storagePrefix = "/manus-storage/";
  if (value.startsWith(storagePrefix)) {
    return storageGetSignedUrl(value.slice(storagePrefix.length));
  }
  throw new Error("The concept reference is not a public or project-storage URL.");
}

class TripoProvider implements ThreeDProvider {
  readonly id = "tripo";
  readonly configured: boolean;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly downloadedModels = new Map<string, string>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.configured = Boolean(apiKey);
    this.model = process.env.TRIPO_DEFAULT_MODEL || "v3.1-20260211";
  }

  private headers() {
    return {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async request(path: string, init?: RequestInit) {
    const response = await fetch(`${TRIPO_BASE_URL}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers ?? {}) },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Tripo API ${response.status}: ${providerError(response, body)}`);
    let parsed: { code?: number; data?: TripoTask; message?: string; suggestion?: string };
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      throw new Error("Tripo API returned invalid JSON.");
    }
    if (parsed.code && parsed.code !== 0) throw new Error(`Tripo API: ${parsed.message ?? "request failed"}${parsed.suggestion ? ` ${parsed.suggestion}` : ""}`);
    if (!parsed.data) throw new Error("Tripo API returned no task data.");
    return parsed.data;
  }

  async generate(input: ThreeDInput): Promise<ThreeDJob> {
    if (!this.configured) throw new Error("Tripo provider not configured. Add TRIPO_API_KEY as a server secret.");
    const imageUrl = await inputUrlForProvider(input.conceptUrl);
    const faceLimit = polygonLimit(input.polygonCount);
    const quality = textureQuality(input.textureQuality);
    const endpoint = imageUrl ? "/generation/image-to-model" : "/generation/text-to-model";
    const payload = imageUrl
      ? {
          input: imageUrl,
          model: this.model,
          prompt: input.prompt || undefined,
          face_limit: faceLimit,
          texture: true,
          pbr: true,
          texture_quality: quality,
          geometry_quality: quality === "extreme" || quality === "detailed" ? "detailed" : "standard",
          enable_image_autofix: true,
        }
      : {
          prompt: input.prompt,
          model: this.model,
          face_limit: faceLimit,
          texture: true,
          pbr: true,
          texture_quality: quality,
          geometry_quality: quality === "extreme" || quality === "detailed" ? "detailed" : "standard",
        };
    const task = await this.request(endpoint, { method: "POST", body: JSON.stringify(payload) });
    if (!task.task_id) throw new Error("Tripo API returned no task_id.");
    return {
      provider: this.id,
      jobId: task.task_id,
      status: "queued",
      progress: task.progress ?? 0,
      stage: imageUrl ? "Image submitted to Tripo" : "Prompt submitted to Tripo",
    };
  }

  async getStatus(jobId: string): Promise<ThreeDJob> {
    const task = await this.request(`/tasks/${encodeURIComponent(jobId)}`, { method: "GET" });
    const rawStatus = task.status?.toLowerCase();
    if (rawStatus === "success") {
      const temporaryUrl = task.output?.model_url;
      if (!temporaryUrl) return { provider: this.id, jobId, status: "failed", progress: 100, stage: "Validation failed", error: "Tripo completed without a model_url." };
      const storedUrl = await this.persistModel(jobId, temporaryUrl);
      return { provider: this.id, jobId, status: "completed", progress: 100, stage: "Model ready in project storage", modelUrl: storedUrl, thumbnailUrl: task.output?.rendered_image_url };
    }
    if (rawStatus === "failed" || rawStatus === "banned" || rawStatus === "expired") {
      return { provider: this.id, jobId, status: "failed", progress: task.progress ?? 0, stage: "Tripo generation failed", error: task.error ?? task.message ?? `Tripo task ended with status ${rawStatus}.` };
    }
    if (rawStatus === "cancelled") return { provider: this.id, jobId, status: "cancelled", progress: task.progress ?? 0, stage: "Cancelled" };
    return { provider: this.id, jobId, status: "processing", progress: task.progress ?? 0, stage: rawStatus === "queued" ? "Queued at Tripo" : "Generating geometry and textures" };
  }

  private async persistModel(jobId: string, temporaryUrl: string) {
    const existing = this.downloadedModels.get(jobId);
    if (existing) return existing;
    const response = await fetch(temporaryUrl);
    if (!response.ok) throw new Error(`Tripo model download failed (${response.status}).`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (!data.byteLength) throw new Error("Tripo returned an empty model file.");
    const stored = await storagePut(`models/tripo/${jobId}.glb`, data, "model/gltf-binary");
    this.downloadedModels.set(jobId, stored.url);
    return stored.url;
  }

  async cancel(jobId: string): Promise<ThreeDJob> {
    throw new Error(`Tripo cancellation is not exposed by the documented v3 task API for ${jobId}.`);
  }
}

class HttpThreeDProvider implements ThreeDProvider {
  readonly id = "http-3d-provider";
  readonly configured = true;
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

let cachedProvider: ThreeDProvider | null | undefined;

export function getThreeDProvider(): ThreeDProvider | null {
  if (cachedProvider !== undefined) return cachedProvider;
  const requested = (process.env.THREE_D_DEFAULT_PROVIDER || "tripo").toLowerCase();
  if (requested === "tripo" && process.env.TRIPO_API_KEY) cachedProvider = new TripoProvider(process.env.TRIPO_API_KEY);
  else if (process.env.THREE_D_PROVIDER_URL && process.env.THREE_D_PROVIDER_API_KEY) cachedProvider = new HttpThreeDProvider(process.env.THREE_D_PROVIDER_URL, process.env.THREE_D_PROVIDER_API_KEY);
  else cachedProvider = null;
  return cachedProvider;
}

export function getProviderStatus() {
  const tripoConfigured = Boolean(process.env.TRIPO_API_KEY);
  const legacyConfigured = Boolean(process.env.THREE_D_PROVIDER_URL && process.env.THREE_D_PROVIDER_API_KEY);
  const configured = tripoConfigured || legacyConfigured;
  return {
    image: { id: "forge-image-service", configured: Boolean(ENV.forgeApiUrl && ENV.forgeApiKey) },
    threeD: {
      id: tripoConfigured ? "tripo" : legacyConfigured ? "http-3d-provider" : "tripo",
      configured,
      model: tripoConfigured ? process.env.TRIPO_DEFAULT_MODEL || "v3.1-20260211" : undefined,
      capabilities: tripoConfigured ? ["text-to-3d", "image-to-3d", "glb", "pbr", "polling"] : [],
    },
    note: configured ? "3D generation uses a real configured provider and persists completed GLB files to project storage." : "Configure TRIPO_API_KEY on the server to enable real Tripo text-to-3D and image-to-3D generation. No fake model is created.",
  };
}
