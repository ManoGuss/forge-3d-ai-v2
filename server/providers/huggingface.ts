import { Client, handle_file } from "@gradio/client";
import { storageGetSignedUrl, storagePut } from "../storage";

export const HF_IMAGE_SPACE = "black-forest-labs/FLUX.1-schnell";
export const HF_IMAGE_REFERENCE_SPACE = "Akjava/flux1-schnell-img2img";
export const HF_3D_SPACES = ["tencent/Hunyuan3D-2", "microsoft/TRELLIS.2"] as const;

type EndpointParameter = { label?: string; parameter_name?: string; parameter_has_default?: boolean; parameter_default?: unknown; type?: string; component?: string };
type EndpointInfo = { parameters?: EndpointParameter[]; returns?: Array<{ type?: string; component?: string; label?: string }>; type?: { generator?: boolean } };
type ApiInfo = { named_endpoints?: Record<string, EndpointInfo> };
type CachedConnection = { client: Client; api: ApiInfo; connectedAt: number };

const connections = new Map<string, Promise<CachedConnection>>();
const completedJobs = new Map<string, { provider: string; jobId: string; status: "completed"; progress: 100; stage: string; modelUrl?: string; error?: string }>();
const CACHE_TTL = 10 * 60_000;
const timeout = (ms: number) => AbortSignal.timeout(ms);

function friendlyError(error: unknown, space: string) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("quota") || lower.includes("rate limit") || lower.includes("429") || lower.includes("exhaust")) return new Error("A cota gratuita do motor de IA foi atingida. Tente novamente mais tarde.");
  if (lower.includes("sleep") || lower.includes("waking") || lower.includes("building") || lower.includes("queue")) return new Error("O motor gratuito de IA está acordando ou ocupado. Aguarde alguns instantes e tente novamente.");
  if (lower.includes("runtime") || lower.includes("space_error") || lower.includes("not found")) return new Error(`O Space gratuito ${space} está temporariamente indisponível. Tente novamente.`);
  if (lower.includes("timeout") || lower.includes("abort")) return new Error("O motor gratuito de IA demorou mais que o esperado. Tente novamente.");
  if (lower === "an error occurred" || lower.includes("an error occurred")) return new Error(`O Space gratuito ${space} encontrou uma falha transitória. O fallback será tentado automaticamente; tente novamente em alguns instantes.`);
  return new Error(`Não foi possível usar o motor gratuito ${space}: ${message}`);
}

async function connect(space: string) {
  const current = connections.get(space);
  if (current) {
    const cached = await current.catch(() => undefined);
    if (cached && Date.now() - cached.connectedAt < CACHE_TTL) return cached;
    connections.delete(space);
  }
  const promise = (async () => {
    try {
      const client = await Client.connect(space, { status_callback: () => undefined });
      const api = await client.view_api() as ApiInfo;
      if (!api.named_endpoints || Object.keys(api.named_endpoints).length === 0) throw new Error("Space sem endpoints Gradio nomeados");
      return { client, api, connectedAt: Date.now() };
    } catch (error) {
      connections.delete(space);
      throw friendlyError(error, space);
    }
  })();
  connections.set(space, promise);
  return promise;
}

function parameters(api: ApiInfo, endpoint: string) { return api.named_endpoints?.[endpoint]?.parameters ?? []; }
function findEndpoint(api: ApiInfo, kind: "image" | "3d", hasImage: boolean) {
  const endpoints = Object.entries(api.named_endpoints ?? {});
  const ranked = endpoints.map(([name, info]) => {
    const names = (info.parameters ?? []).map(item => `${item.parameter_name ?? ""} ${item.label ?? ""}`.toLowerCase()).join(" ");
    let score = 0;
    if (kind === "image") { if (names.includes("prompt")) score += 8; if (hasImage && names.includes("image")) score += 10; if (names.includes("width")) score += 2; if (name.includes("infer")) score += 4; }
    else { if (hasImage && names.includes("image")) score += 8; if (!hasImage && names.includes("caption")) score += 8; if (names.includes("octree")) score += 3; if (hasImage && name.includes("shape_generation")) score += 8; if (name.includes("generation_all")) score += 3; }
    return { name, info, score };
  }).sort((a, b) => b.score - a.score)[0];
  if (!ranked || ranked.score < (kind === "image" ? (hasImage ? 10 : 6) : 7)) throw new Error(`Nenhum endpoint compatível foi descoberto no Space ${kind}.`);
  return ranked;
}

function valueFor(parameter: EndpointParameter, input: { prompt?: string; image?: string; style?: string; seed?: number; width?: number; height?: number; resolution?: string; quality?: string }) {
  const name = `${parameter.parameter_name ?? ""} ${parameter.label ?? ""}`.toLowerCase();
  if (name.includes("prompt") || name.includes("caption") || name.includes("description")) return [input.prompt ?? "" , input.style ? ` Direção visual: ${input.style}.` : ""].join("");
  if (parameter.component?.toLowerCase() === "image" || name === "image" || name.endsWith(" image") || name.includes("input image")) return input.image ? handle_file(input.image) : parameter.parameter_default ?? null;
  if (name.includes("seed")) return input.seed ?? parameter.parameter_default ?? 1234;
  if (name.includes("randomize")) return false;
  if (name.includes("width")) return input.width ?? parameter.parameter_default ?? 1024;
  if (name.includes("height")) return input.height ?? parameter.parameter_default ?? 1024;
  if (name.includes("resolution") || name.includes("texture size")) return input.resolution ?? parameter.parameter_default ?? "1024";
  if (name.includes("steps") || name.includes("inference")) return parameter.parameter_default ?? 4;
  if (name.includes("guidance")) return parameter.parameter_default ?? 5;
  if (name.includes("octree")) return parameter.parameter_default ?? 256;
  if (name.includes("chunk")) return parameter.parameter_default ?? 8000;
  if (name.includes("background")) return parameter.parameter_default ?? true;
  if (name.includes("quality") || name.includes("mode")) return input.quality ?? parameter.parameter_default ?? "Standard";
  return parameter.parameter_has_default ? parameter.parameter_default : null;
}

async function resolveInputUrl(url?: string) {
  if (!url) return undefined;
  const storagePrefix = "/manus-storage/";
  if (url.startsWith(storagePrefix)) return storageGetSignedUrl(url.slice(storagePrefix.length));
  return url;
}

function allUrls(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    if (value.startsWith("data:") || value.startsWith("http")) return [value];
    return Array.from(value.matchAll(/https?:\/\/[^\s"'<>]+/g), match => match[0].replace(/[),.;]+$/, ""));
  }
  if (Array.isArray(value)) return value.flatMap(allUrls);
  if (typeof value === "object") { const record = value as Record<string, unknown>; return [record.url, record.path].flatMap(item => typeof item === "string" ? [item] : []).concat(Object.values(record).flatMap(allUrls)); }
  return [];
}

async function saveResult(value: unknown, key: string, mimeType: string) {
  const candidate = allUrls(value)[0];
  if (!candidate) throw new Error("O Space concluiu sem devolver um arquivo compatível.");
  let bytes: Buffer;
  if (candidate.startsWith("data:")) { const match = candidate.match(/^data:[^;]+;base64,(.+)$/); if (!match) throw new Error("Resultado data URL inválido."); bytes = Buffer.from(match[1], "base64"); }
  else { const response = await fetch(candidate, { signal: timeout(120_000) }); if (!response.ok) throw new Error(`Não foi possível baixar o resultado do Space (${response.status}).`); bytes = Buffer.from(await response.arrayBuffer()); }
  if (!bytes.length) throw new Error("O Space retornou um arquivo vazio.");
  return storagePut(key, bytes, mimeType);
}

async function runWithRetry<T>(task: () => Promise<T>) { let last: unknown; for (let attempt = 0; attempt < 3; attempt += 1) { try { return await task(); } catch (error) { last = error; if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1))); } } throw last; }

export async function inspectHuggingFaceSpace(space: string) { try { const connection = await connect(space); return { space, available: true, endpointCount: Object.keys(connection.api.named_endpoints ?? {}).length, endpoints: Object.keys(connection.api.named_endpoints ?? {}) }; } catch (error) { return { space, available: false, endpointCount: 0, endpoints: [], status: error instanceof Error ? error.message : String(error) }; } }

export async function getHuggingFaceHealth() {
  const image = await inspectHuggingFaceSpace(process.env.IMAGE_SPACE || HF_IMAGE_SPACE);
  const threeD = await Promise.all([...(process.env.THREED_SPACE ? [process.env.THREED_SPACE] : []), ...HF_3D_SPACES].filter((value, index, array) => array.indexOf(value) === index).map(inspectHuggingFaceSpace));
  const selected3D = threeD.find(item => item.available) ?? threeD[0];
  return { image: { available: image.available, engine: "FLUX via Hugging Face Space", status: image.available ? "Space público conectado" : image.status ?? "Space indisponível", space: image.space, endpoints: image.endpoints }, threeD: { available: Boolean(selected3D?.available), engine: "Hunyuan3D/TRELLIS via Hugging Face Space", status: selected3D?.available ? "Space público conectado" : selected3D?.status ?? "Spaces indisponíveis", space: selected3D?.space, endpoints: selected3D?.endpoints } };
}

export async function generateHuggingFaceConcept(input: { prompt: string; style: string; originalImages?: Array<{ url?: string; b64Json?: string; mimeType?: string }> }) {
  const hasReference = Boolean(input.originalImages?.[0]?.url);
  const spaces = [hasReference ? (process.env.IMAGE_REFERENCE_SPACE || HF_IMAGE_REFERENCE_SPACE) : undefined, process.env.IMAGE_SPACE || HF_IMAGE_SPACE].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
  let last: unknown;
  for (const space of spaces) try {
    const usingReferenceEndpoint = hasReference && space === (process.env.IMAGE_REFERENCE_SPACE || HF_IMAGE_REFERENCE_SPACE); const connection = await connect(space); const endpoint = findEndpoint(connection.api, "image", usingReferenceEndpoint); const image = usingReferenceEndpoint ? await resolveInputUrl(input.originalImages?.[0]?.url) : undefined; const data = parameters(connection.api, endpoint.name).map(parameter => valueFor(parameter, { prompt: input.prompt, style: input.style, image, seed: 1234 }));
    const result = await runWithRetry(() => connection.client.predict(endpoint.name, data));
    const stored = await saveResult((result as { data?: unknown }).data, `generations/${Date.now()}/concept.png`, "image/png");
    return { provider: `huggingface-space:${space}`, status: "completed" as const, progress: 100, stage: hasReference ? "Concept baseado no doodle/referência concluído" : "Concept concluído no Space gratuito", url: stored.url, endpoint: endpoint.name, space };
  } catch (error) { last = error; }
  const space = spaces[0] ?? HF_IMAGE_SPACE;
  throw friendlyError(last ?? new Error("Nenhum Space de concept disponível"), space);
}

export async function generateHuggingFace3D(input: { prompt: string; conceptUrl?: string; modelStyle?: string; materialPreset?: string; resolution?: string; quality?: string }) {
  const spaces = [process.env.THREED_SPACE, ...HF_3D_SPACES].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
  let last: unknown;
  for (const space of spaces) {
    try {
      const connection = await connect(space); const endpoint = findEndpoint(connection.api, "3d", Boolean(input.conceptUrl)); const image = await resolveInputUrl(input.conceptUrl); const generationPrompt = [input.prompt, input.modelStyle ? `Estilo 3D: ${input.modelStyle}.` : "", input.materialPreset ? `Material: ${input.materialPreset}.` : "", input.resolution ? `Resolução alvo: ${input.resolution}.` : "", input.quality ? `Qualidade: ${input.quality}.` : ""].filter(Boolean).join(" "); const data = parameters(connection.api, endpoint.name).map(parameter => valueFor(parameter, { prompt: generationPrompt, image, seed: 1234, resolution: input.resolution, quality: input.quality }));
      const result = await runWithRetry(() => connection.client.predict(endpoint.name, data));
      const stored = await saveResult((result as { data?: unknown }).data, `generations/${Date.now()}/model.glb`, "model/gltf-binary");
      const jobId = `${space}:${Date.now()}`; const job = { provider: `huggingface-space:${space}`, jobId, status: "completed" as const, progress: 100 as const, stage: "Modelo 3D concluído no Space gratuito", modelUrl: stored.url }; completedJobs.set(jobId, job); return { ...job, endpoint: endpoint.name, space };
    } catch (error) { last = error; }
  }
  const detail = last instanceof Error ? last.message : "falha desconhecida";
  throw new Error(`Os Spaces gratuitos de geração 3D estão indisponíveis no momento. Hunyuan3D e fallback TRELLIS foram tentados. ${detail}`);
}

export function isHuggingFaceEnabled() { return process.env.DISABLE_HUGGINGFACE_SPACES !== "1"; }
export function getHuggingFaceJobStatus(jobId: string) { return completedJobs.get(jobId); }
