type ImageInput = { url?: string; b64Json?: string; mimeType?: string };

type LocalImageResponse = { url?: string; dataUrl?: string; provider?: string; jobId?: string; statusUrl?: string; status?: string; progress?: number; stage?: string; error?: string; message?: string };
export type ConceptJob = { provider: string; jobId?: string; status: "queued" | "processing" | "completed" | "failed"; progress: number; stage: string; url?: string; error?: string };

function gatewayUrl() { return (process.env.IMAGE_ENGINE_URL ?? "").replace(/\/+$/, ""); }
export function isLocalImageConfigured() { return Boolean(gatewayUrl()); }
function mapStatus(raw?: string): ConceptJob["status"] { const status = raw?.toLowerCase(); if (status === "completed" || status === "success" || status === "done") return "completed"; if (status === "failed" || status === "error") return "failed"; return status === "queued" || status === "pending" ? "queued" : "processing"; }
function readUrl(payload: LocalImageResponse) { return payload.url ?? payload.dataUrl; }

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { accept: "application/json", "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`Motor de concept local respondeu ${response.status}: ${body || response.statusText}`);
  try { return JSON.parse(body) as LocalImageResponse; } catch { throw new Error("O motor de concept local retornou uma resposta inválida."); }
}

export async function generateLocalConcept(input: { prompt: string; style: string; originalImages?: ImageInput[] }): Promise<ConceptJob> {
  const url = gatewayUrl();
  if (!url) throw new Error("Motor de concept local indisponível. Configure IMAGE_ENGINE_URL para conectar Flux/ComfyUI.");
  const payload = await request(url, { method: "POST", body: JSON.stringify({ prompt: input.prompt, style: input.style, references: input.originalImages ?? [], constraints: ["objeto único", "inteiro visível", "centralizado", "fundo neutro", "iluminação de estúdio", "sem texto", "sem marca d'água"] }) });
  const status = mapStatus(payload.status ?? (readUrl(payload) ? "completed" : payload.jobId ? "queued" : undefined));
  return { provider: payload.provider ?? "flux-local-gateway", jobId: payload.jobId, status, progress: payload.progress ?? (status === "completed" ? 100 : 4), stage: payload.stage ?? (status === "completed" ? "Concept pronto" : "Job enviado ao Flux/ComfyUI"), url: readUrl(payload), error: payload.error ?? payload.message };
}

export async function getLocalConceptStatus(jobId: string): Promise<ConceptJob> {
  const url = gatewayUrl();
  if (!url) throw new Error("Motor de concept local indisponível.");
  const payload = await request(`${url}/status/${encodeURIComponent(jobId)}`, { method: "GET" });
  const status = mapStatus(payload.status);
  return { provider: payload.provider ?? "flux-local-gateway", jobId, status, progress: payload.progress ?? (status === "completed" ? 100 : status === "queued" ? 4 : 58), stage: payload.stage ?? (status === "completed" ? "Concept pronto" : "Renderizando concept"), url: readUrl(payload), error: payload.error ?? payload.message };
}

export async function getLocalImageHealth() {
  const url = gatewayUrl();
  if (!url) return { available: false, engine: "Flux/ComfyUI", status: "Gateway local não configurado", urlConfigured: false };
  try { const payload = await request(`${url}/health`, { method: "GET" }); return { available: payload.status !== "offline", engine: payload.provider ?? "Flux/ComfyUI", status: payload.message ?? "Gateway local online", urlConfigured: true }; } catch { return { available: false, engine: "Flux/ComfyUI", status: "Não foi possível conectar ao gateway local", urlConfigured: true }; }
}
