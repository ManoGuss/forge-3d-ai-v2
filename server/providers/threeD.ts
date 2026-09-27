import { storagePut } from "../storage";

type ThreeDInput = {
  prompt: string;
  conceptUrl?: string;
  polygonCount?: string;
  textureQuality?: string;
};

type HunyuanTask = {
  uid?: string;
  status?: string;
  progress?: number;
  model_base64?: string;
  model_url?: string;
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

export type LocalEngineHealth = {
  available: boolean;
  engine: string;
  gpuAvailable: boolean;
  vram: number;
  status: string;
  urlConfigured: boolean;
};

export interface ThreeDProvider {
  readonly id: string;
  readonly configured: boolean;
  generate(input: ThreeDInput): Promise<ThreeDJob>;
  getStatus(jobId: string): Promise<ThreeDJob>;
  cancel(jobId: string): Promise<ThreeDJob>;
}

const engineUrl = () => (process.env.HUNYUAN3D_URL ?? "").replace(/\/+$/, "");

function faceCount(value?: string) {
  const parsed = Number.parseInt(value?.replace(/[^0-9]/g, "") ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 40000;
  return Math.min(Math.max(parsed, 1000), 250000);
}

function imageDataUrl(value: string, mimeType = "image/png") {
  return value.startsWith("data:") ? value : `data:${mimeType};base64,${value}`;
}

async function referenceToDataUrl(value: string) {
  if (value.startsWith("data:")) return value;
  const response = await fetch(value);
  if (!response.ok) throw new Error(`Não foi possível ler a referência visual (${response.status}).`);
  const contentType = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer()).toString("base64");
  return imageDataUrl(bytes, contentType);
}

function mapStatus(raw?: string): ThreeDJob["status"] {
  const status = raw?.toLowerCase();
  if (status === "completed" || status === "success" || status === "done") return "completed";
  if (status === "failed" || status === "error") return "failed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "queued" || status === "pending") return "queued";
  return "processing";
}

function stageFor(status: ThreeDJob["status"]) {
  if (status === "queued") return "Na fila do motor local";
  if (status === "processing") return "Gerando geometria e textura";
  if (status === "completed") return "Modelo salvo no projeto";
  if (status === "cancelled") return "Geração cancelada";
  return "Falha no motor local";
}

class Hunyuan3DProvider implements ThreeDProvider {
  readonly id = "hunyuan3d-local";
  readonly configured: boolean;
  private readonly downloadedModels = new Map<string, string>();

  constructor(private readonly baseUrl: string) {
    this.configured = Boolean(baseUrl);
  }

  private async request(path: string, init?: RequestInit) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { accept: "application/json", "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Motor Hunyuan3D respondeu ${response.status}: ${body || response.statusText}`);
    try {
      return JSON.parse(body) as HunyuanTask;
    } catch {
      throw new Error("O motor Hunyuan3D retornou uma resposta inválida.");
    }
  }

  async generate(input: ThreeDInput): Promise<ThreeDJob> {
    if (!this.configured) throw new Error("Motor Hunyuan3D local indisponível. Configure HUNYUAN3D_URL no servidor.");
    if (!input.conceptUrl) throw new Error("O Hunyuan3D local recebe uma imagem de referência. Gere ou envie um concept antes de criar o modelo 3D.");
    const image = await referenceToDataUrl(input.conceptUrl);
    const task = await this.request("/send", {
      method: "POST",
      body: JSON.stringify({
        image,
        remove_background: true,
        texture: input.textureQuality !== "None",
        seed: 1234,
        face_count: faceCount(input.polygonCount),
        type: "glb",
        prompt: input.prompt,
      }),
    });
    const jobId = task.uid;
    if (!jobId) throw new Error("O motor Hunyuan3D não retornou um identificador de job.");
    return { provider: this.id, jobId, status: "queued", progress: task.progress ?? 0, stage: "Enviado ao Hunyuan3D local" };
  }

  async getStatus(jobId: string): Promise<ThreeDJob> {
    const task = await this.request(`/status/${encodeURIComponent(jobId)}`, { method: "GET" });
    const status = mapStatus(task.status);
    if (status === "completed") {
      if (task.model_url) return { provider: this.id, jobId, status, progress: 100, stage: stageFor(status), modelUrl: task.model_url };
      if (!task.model_base64) return { provider: this.id, jobId, status: "failed", progress: 100, stage: "Resposta sem modelo", error: "O Hunyuan3D concluiu sem devolver um GLB." };
      const existing = this.downloadedModels.get(jobId);
      const modelUrl = existing ?? (await storagePut(`models/hunyuan3d/${jobId}.glb`, Buffer.from(task.model_base64, "base64"), "model/gltf-binary")).url;
      this.downloadedModels.set(jobId, modelUrl);
      return { provider: this.id, jobId, status, progress: 100, stage: stageFor(status), modelUrl };
    }
    return { provider: this.id, jobId, status, progress: task.progress ?? (status === "queued" ? 4 : 52), stage: stageFor(status), error: task.error ?? task.message };
  }

  async cancel(jobId: string): Promise<ThreeDJob> {
    throw new Error(`O cancelamento não é exposto pela API oficial do Hunyuan3D para o job ${jobId}.`);
  }
}

let cachedProvider: ThreeDProvider | null | undefined;
let cachedProviderUrl = "";

export function getThreeDProvider(): ThreeDProvider | null {
  const url = engineUrl();
  if (cachedProvider !== undefined && cachedProviderUrl === url) return cachedProvider;
  cachedProviderUrl = url;
  cachedProvider = url ? new Hunyuan3DProvider(url) : null;
  return cachedProvider;
}

export async function getLocalEngineHealth(): Promise<LocalEngineHealth> {
  const url = engineUrl();
  if (!url) return { available: false, engine: "Hunyuan3D-2.1", gpuAvailable: false, vram: 0, status: "Motor local não configurado", urlConfigured: false };
  try {
    const response = await fetch(`${url}/health`, { headers: { accept: "application/json" } });
    const payload = (await response.json()) as { available?: boolean; gpuAvailable?: boolean; vram?: number; status?: string };
    return { available: response.ok && payload.available !== false, engine: "Hunyuan3D-2.1", gpuAvailable: payload.gpuAvailable ?? true, vram: payload.vram ?? 0, status: payload.status ?? (response.ok ? "Motor local online" : "Motor local indisponível"), urlConfigured: true };
  } catch {
    return { available: false, engine: "Hunyuan3D-2.1", gpuAvailable: false, vram: 0, status: "Não foi possível conectar ao motor local", urlConfigured: true };
  }
}

export function getProviderStatus() {
  const threeDConfigured = Boolean(engineUrl());
  const imageConfigured = Boolean(process.env.IMAGE_ENGINE_URL);
  return {
    image: { id: "flux-local-gateway", configured: imageConfigured, capabilities: imageConfigured ? ["concept", "image-to-image"] : [] },
    threeD: { id: "hunyuan3d-local", configured: threeDConfigured, capabilities: threeDConfigured ? ["image-to-3d", "glb", "polling"] : [] },
    fx: { id: "local-fx", configured: false, capabilities: ["procedural-particles", "materials", "animation"] },
    localEngine: { engine: "Hunyuan3D-2.1", urlConfigured: threeDConfigured, status: threeDConfigured ? "Configurado; aguardando health check" : "Motor local não configurado" },
    note: "O Forge usa engines locais configuráveis. Nenhuma API comercial ou crédito por geração é usado pelo fluxo principal.",
  };
}
