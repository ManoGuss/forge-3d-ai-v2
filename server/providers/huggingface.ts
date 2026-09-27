import { Client, handle_file } from "@gradio/client";
import { readFile } from "node:fs/promises";
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
const unavailableSpaces = new Map<string, { until: number; reason: string }>();
const CACHE_TTL = 10 * 60_000;
const FAILURE_COOLDOWN = 2 * 60_000;
const timeout = (ms: number) => AbortSignal.timeout(ms);

export type ThreeDProviderDiagnostic = { provider: string; endpoint?: string; status?: number; error: string; retryable: boolean };

function isTransientProviderError(error: unknown) { const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase(); return ["service unavailable", "an error occurred", "503", "502", "504", "429", "timeout", "abort", "queue", "connection", "overloaded"].some(marker => message.includes(marker)); }

function friendlyError(error: unknown, space: string) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("quota") || lower.includes("rate limit") || lower.includes("429") || lower.includes("exhaust")) return new Error("A cota gratuita do motor de IA foi atingida. Tente novamente mais tarde.");
  if (lower.includes("sleep") || lower.includes("waking") || lower.includes("building") || lower.includes("queue")) return new Error("O motor gratuito de IA está acordando ou ocupado. Aguarde alguns instantes e tente novamente.");
  if (lower.includes("runtime") || lower.includes("space_error") || lower.includes("not found")) return new Error(`O Space gratuito ${space} está temporariamente indisponível. Tente novamente.`);
  if (lower.includes("timeout") || lower.includes("abort")) return new Error("O motor gratuito de IA demorou mais que o esperado. Tente novamente.");
  if (lower.includes("service unavailable") || lower.includes("unexpected token 's'") || lower.includes('unexpected token "s"') || lower === "an error occurred" || lower.includes("an error occurred") || lower.includes("502") || lower.includes("503") || lower.includes("504")) return new Error("O serviço de geração 3D está temporariamente indisponível. Os motores gratuitos foram tentados; tente novamente em alguns minutos.");
  return new Error(`Não foi possível concluir a geração 3D gratuita no momento. Tente novamente mais tarde.`);
}

function suppressed(space: string) { const entry = unavailableSpaces.get(space); if (!entry) return false; if (entry.until <= Date.now()) { unavailableSpaces.delete(space); return false; } return true; }
function markUnavailable(space: string, error: unknown) { unavailableSpaces.set(space, { until: Date.now() + FAILURE_COOLDOWN, reason: error instanceof Error ? error.message : String(error) }); }

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
  const parameterName = (parameter.parameter_name ?? "").toLowerCase();
  const isPrimaryImage = parameterName === "image" || name === "image" || name.endsWith(" input image");
  if (isPrimaryImage) return input.image ? handle_file(input.image) : parameter.parameter_default ?? null;
  if (name.includes("seed")) return input.seed ?? parameter.parameter_default ?? 1234;
  if (name.includes("randomize")) return false;
  if (name.includes("width")) return input.width ?? parameter.parameter_default ?? 1024;
  if (name.includes("height")) return input.height ?? parameter.parameter_default ?? 1024;
  if (name.includes("resolution") || name.includes("texture size")) return input.resolution ?? parameter.parameter_default ?? "1024";
  if (name.includes("steps") || name.includes("inference")) return parameter.parameter_default ?? 4;
  if (name.includes("guidance")) return parameter.parameter_default ?? 5;
  if (name.includes("octree")) return input.resolution === "512" ? 128 : input.resolution === "1536" ? 384 : 256;
  if (name.includes("chunk")) return input.quality === "Rápida" ? 2000 : input.quality === "Máxima" ? 16000 : parameter.parameter_default ?? 8000;
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

async function downloadBytes(url: string) {
  const controller = new AbortController();
  const hardTimeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "model/gltf-binary,application/octet-stream,*/*" } });
    if (!response.ok) throw new Error(`Download do resultado retornou HTTP ${response.status}.`);
    if (!response.body) throw new Error("Download do resultado retornou um corpo vazio.");
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const read = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Timeout durante o download do GLB.")); }, 30_000); }),
          ]);
          if (read.done) break;
          if (read.value) { const chunk = Buffer.from(read.value); chunks.push(chunk); total += chunk.length; }
        } finally { if (timer) clearTimeout(timer); }
      }
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    finally { reader.releaseLock(); }
    return Buffer.concat(chunks, total);
  } finally { clearTimeout(hardTimeout); controller.abort(); }
}

async function saveResult(value: unknown, key: string, mimeType: string) {
  const candidate = allUrls(value)[0];
  if (!candidate) throw new Error("O Space concluiu sem devolver um arquivo compatível.");
  let bytes: Buffer;
  if (candidate.startsWith("data:")) { const match = candidate.match(/^data:[^;]+;base64,(.+)$/); if (!match) throw new Error("Resultado data URL inválido."); bytes = Buffer.from(match[1], "base64"); }
  else if (candidate.startsWith("/") || candidate.startsWith("file:")) { bytes = await readFile(candidate.replace(/^file:\/\//, "")); }
  else {
    let last: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const started = Date.now();
        bytes = await downloadBytes(candidate);
        console.info(`[Forge 3D] endpoint=result-download tentativa=${attempt} status=200 bytes=${bytes.length} tempoMs=${Date.now() - started}`);
        break;
      } catch (error) {
        last = error;
        console.warn(`[Forge 3D] endpoint=result-download tentativa=${attempt}/3 status=erro`);
        if (!isTransientProviderError(error) || attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
      }
    }
    if (!bytes!) throw last ?? new Error("Download do resultado não concluído.");
  }
  if (!bytes.length) throw new Error("O Space retornou um arquivo vazio.");
  if (mimeType === "model/gltf-binary" && bytes.subarray(0, 4).toString("ascii") !== "glTF") throw new Error("O Space retornou um arquivo que não é um GLB válido.");
  return storagePut(key, bytes, mimeType);
}

function resultData(result: unknown) { return (result as { data?: unknown })?.data; }

async function generateTrellis2(connection: CachedConnection, image: string, input: { resolution?: string; quality?: string }) {
  const api = connection.api;
  const start = api.named_endpoints?.["/start_session"];
  if (start) await runWithRetry(() => connection.client.predict("/start_session", []), "microsoft/TRELLIS.2/session", "/start_session");
  const endpoint = api.named_endpoints?.["/image_to_3d"];
  if (!endpoint) throw new Error("O Space TRELLIS.2 não expõe /image_to_3d.");
  const generationData = (endpoint.parameters ?? []).map(parameter => valueFor(parameter, { image, seed: 1234, resolution: input.resolution ?? "512", quality: input.quality }));
  const preview = await runWithRetry(() => connection.client.predict("/image_to_3d", generationData), "microsoft/TRELLIS.2/image_to_3d", "/image_to_3d");
  const previewData = resultData(preview);
  const state = Array.isArray(previewData) ? previewData[0] : undefined;
  if (!state || typeof state !== "object") throw new Error("TRELLIS.2 concluiu a geração, mas não devolveu o estado do modelo para extração GLB.");
  const extract = api.named_endpoints?.["/extract_glb"];
  if (!extract) throw new Error("O Space TRELLIS.2 não expõe /extract_glb.");
  const extractData = (extract.parameters ?? []).map((parameter, index) => index === 0 ? state : valueFor(parameter, { resolution: input.resolution ?? "1024", quality: input.quality }));
  const glb = await runWithRetry(() => connection.client.predict("/extract_glb", extractData), "microsoft/TRELLIS.2/extract_glb", "/extract_glb");
  return resultData(glb);
}

async function runWithRetry<T>(task: () => Promise<T>, provider: string, endpoint = "unknown") { let last: unknown; for (let attempt = 0; attempt < 3; attempt += 1) { const started = Date.now(); try { const result = await task(); console.info(`[Forge 3D] provider=${provider} endpoint=${endpoint} tentativa=${attempt + 1} status=ok tempoMs=${Date.now() - started}`); return result; } catch (error) { last = error; console.warn(`[Forge 3D] provider=${provider} endpoint=${endpoint} tentativa=${attempt + 1}/3 status=erro tempoMs=${Date.now() - started}`); if (!isTransientProviderError(error) || attempt === 2) break; await new Promise(resolve => setTimeout(resolve, 1200 * (attempt + 1))); } } throw last; }

export async function inspectHuggingFaceSpace(space: string) { if (suppressed(space)) { const entry = unavailableSpaces.get(space); return { space, available: false, endpointCount: 0, endpoints: [], status: "Inferência temporariamente indisponível após falha recente" }; } try { const connection = await connect(space); return { space, available: true, endpointCount: Object.keys(connection.api.named_endpoints ?? {}).length, endpoints: Object.keys(connection.api.named_endpoints ?? {}) }; } catch (error) { return { space, available: false, endpointCount: 0, endpoints: [], status: error instanceof Error ? error.message : String(error) }; } }

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
    const result = await runWithRetry(() => connection.client.predict(endpoint.name, data), space);
    const stored = await saveResult((result as { data?: unknown }).data, `generations/${Date.now()}/concept.png`, "image/png");
    return { provider: `huggingface-space:${space}`, status: "completed" as const, progress: 100, stage: hasReference ? "Concept baseado no doodle/referência concluído" : "Concept concluído no Space gratuito", url: stored.url, endpoint: endpoint.name, space };
  } catch (error) { last = error; }
  const space = spaces[0] ?? HF_IMAGE_SPACE;
  throw friendlyError(last ?? new Error("Nenhum Space de concept disponível"), space);
}

export async function generateHuggingFace3D(input: { prompt: string; conceptUrl?: string; modelStyle?: string; materialPreset?: string; resolution?: string; quality?: string }) {
  const spaces = [process.env.THREED_SPACE, ...HF_3D_SPACES].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
  let last: unknown;
  let lastSpace = spaces[0] ?? HF_3D_SPACES[0];
  const diagnostics: ThreeDProviderDiagnostic[] = [];
  const requestId = `3d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  for (const space of spaces) {
    if (suppressed(space)) continue;
    lastSpace = space;
    try {
      const connection = await connect(space); const image = await resolveInputUrl(input.conceptUrl); if (!image) throw new Error("O concept não possui uma URL acessível pelo backend."); const generationPrompt = [input.prompt, input.modelStyle ? `Estilo 3D: ${input.modelStyle}.` : "", input.materialPreset ? `Material: ${input.materialPreset}.` : "", input.resolution ? `Resolução alvo: ${input.resolution}.` : "", input.quality ? `Qualidade: ${input.quality}.` : "", "Entregar asset de jogo completo: malha limpa, UV map, materiais PBR e texturas incorporadas no GLB; se o Space suportar, incluir rig, animações e efeitos descritos no prompt. Não incluir texto, marca d'água ou objetos extras."].filter(Boolean).join(" ");
      const endpoint = findEndpoint(connection.api, "3d", true);
      const resultDataValue = space === "microsoft/TRELLIS.2"
        ? await generateTrellis2(connection, image, input)
        : resultData(await runWithRetry(
          () => connection.client.predict(endpoint.name, parameters(connection.api, endpoint.name).map(parameter => valueFor(parameter, { prompt: generationPrompt, image, seed: 1234, resolution: input.resolution, quality: input.quality }))),
          space,
          endpoint.name,
        ));
      const stored = await saveResult(resultDataValue, `generations/${Date.now()}/model.glb`, "model/gltf-binary");
      unavailableSpaces.delete(space); const jobId = `${space}:${Date.now()}`; const job = { provider: `huggingface-space:${space}`, jobId, status: "completed" as const, progress: 100 as const, stage: "Malha, UV, materiais e texturas concluídos no Space gratuito", modelUrl: stored.url, assetManifest: { geometry: true, uvMap: true, pbrMaterials: true, embeddedTextures: true, rig: false, animations: false, particles: false, note: "Rig, animações e partículas só são incorporados quando o provider 3D expõe suporte nativo; o prompt foi enviado para tentar habilitá-los." } }; completedJobs.set(jobId, job); return { ...job, endpoint: endpoint.name, space };
    } catch (error) {
      last = error;
      const providerError = error instanceof Error ? error.message : String(error);
      const status = providerError.match(/\b(401|403|404|408|429|500|502|503|504)\b/)?.[1];
      diagnostics.push({ provider: space, endpoint: space === "microsoft/TRELLIS.2" ? "/image_to_3d → /extract_glb" : "/shape_generation", status: status ? Number(status) : undefined, error: providerError, retryable: isTransientProviderError(error) });
      markUnavailable(space, error);
      console.warn(`[Forge 3D] Provider ${space} indisponível; tentando fallback:`, providerError);
    }
  }
  const providerError = last instanceof Error ? last.message : String(last ?? "provider_unavailable");
  const finalError = friendlyError(last ?? new Error("provider_unavailable"), lastSpace);
  Object.assign(finalError, { code: "3D_GENERATION_FAILED", provider: lastSpace, status: Number(providerError.match(/\b(401|403|404|408|429|500|502|503|504)\b/)?.[1] ?? 503), retryable: isTransientProviderError(last), providerError, requestId, diagnostics });
  console.error("[Forge 3D] generation_failed", JSON.stringify({ requestId, code: "3D_GENERATION_FAILED", provider: lastSpace, providerError, retryable: isTransientProviderError(last), diagnostics }));
  throw finalError;
}

export function isHuggingFaceEnabled() { return process.env.DISABLE_HUGGINGFACE_SPACES !== "1"; }
export function getHuggingFaceJobStatus(jobId: string) { return completedJobs.get(jobId); }
