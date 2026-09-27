import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { inspectModels, type ModelEntry } from "./modelManager";

export type EngineKind = "image" | "threeD";
export type EngineState = "discovering" | "preparing" | "starting" | "online" | "offline" | "unavailable";
export type RuntimeEngine = { kind: EngineKind; type: string; url?: string; status: EngineState; stage: string; progress: number; source: "runtime" | "manual" | "discovered" | "worker" | "none"; error?: string; pid?: number };
export type RuntimeConfig = { version: 1; generatedAt: string; profile: "AUTO" | "LOW_VRAM" | "BALANCED" | "HIGH_QUALITY"; environment: { node: string; python: string | null; docker: boolean; gpu: string | null; vram: number; cuda: boolean; ram: number; cpu: number; storage: number; }; engines: { image: RuntimeEngine; threeD: RuntimeEngine }; models: ModelEntry[]; worker?: { url: string; status: string; capabilities?: Record<string, unknown> }; ready: boolean; message: string };

type ManagedProcess = { process: ChildProcess; kind: EngineKind; port: number };
const runtimePath = () => process.env.FORGE_AI_RUNTIME_PATH || path.join(process.cwd(), ".ai-runtime.json");
const managed = new Map<EngineKind, ManagedProcess>();
let cached: RuntimeConfig | undefined;
let bootstrapPromise: Promise<RuntimeConfig> | undefined;

function commandExists(command: string) { try { execFileSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore", timeout: 1200 }); return true; } catch { return false; } }
function detectGpu() { try { const text = execFileSync("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], { encoding: "utf8", timeout: 1500 }).trim(); const [name, memory] = text.split(",").map(value => value.trim()); return { name: name || null, vram: Number(memory) || 0, cuda: Boolean(name) }; } catch { return { name: null, vram: 0, cuda: false }; } }
function availableStorage() { try { const output = execFileSync("df", ["-Pk", process.cwd()], { encoding: "utf8", timeout: 1200 }).trim().split("\n").pop() ?? ""; return Number(output.trim().split(/\s+/)[3]) * 1024 || 0; } catch { return 0; } }
function systemInfo() { const gpu = detectGpu(); return { node: process.version, python: commandExists("python3") ? "python3" : commandExists("python") ? "python" : null, docker: commandExists("docker"), gpu: gpu.name, vram: gpu.vram, cuda: gpu.cuda, ram: os.totalmem(), cpu: os.cpus().length, storage: availableStorage() }; }
function profileFor(info: ReturnType<typeof systemInfo>): RuntimeConfig["profile"] { if (!info.gpu || info.vram < 8000) return "LOW_VRAM"; if (info.vram >= 20000) return "HIGH_QUALITY"; return "BALANCED"; }
function portAvailable(port: number) { return new Promise<boolean>(resolve => { const server = net.createServer(); server.once("error", () => resolve(false)); server.listen(port, "127.0.0.1", () => server.close(() => resolve(true))); }); }
async function pickPort(start: number) { for (let port = start; port < start + 20; port += 1) if (await portAvailable(port)) return port; return undefined; }
async function probe(url: string) { try { const response = await fetch(`${url.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(1800), headers: { accept: "application/json" } }); return response.ok; } catch { return false; } }
async function discoverUrl(kind: EngineKind) { const configured = kind === "image" ? process.env.IMAGE_ENGINE_URL || process.env.COMFYUI_URL : process.env.HUNYUAN3D_URL; if (configured && await probe(configured)) return { url: configured.replace(/\/+$/, ""), source: "manual" as const }; const start = kind === "image" ? 8188 : 8081; for (let port = start; port < start + 8; port += 1) { const url = `http://127.0.0.1:${port}`; if (await probe(url)) return { url, source: "discovered" as const }; } return undefined; }
async function maybeStart(kind: EngineKind, info: ReturnType<typeof systemInfo>) {
  const executable = info.python;
  const configuredPath = kind === "image" ? process.env.COMFYUI_PATH : process.env.HUNYUAN3D_PATH;
  if (!executable || !configuredPath || !existsSync(configuredPath)) return undefined;
  if (kind === "threeD" && !info.gpu) return undefined;
  const port = await pickPort(kind === "image" ? 8188 : 8081); if (!port) return undefined;
  const args = kind === "image" ? [path.join(configuredPath, "main.py"), "--listen", "127.0.0.1", "--port", String(port)] : [path.join(configuredPath, "api_server.py"), "--host", "127.0.0.1", "--port", String(port)];
  if (!existsSync(args[0])) return undefined;
  const child = spawn(executable, args, { cwd: configuredPath, env: { ...process.env }, stdio: "ignore", detached: false });
  managed.set(kind, { process: child, kind, port });
  child.once("exit", () => managed.delete(kind));
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 15; attempt += 1) { if (await probe(url)) return { url, source: "runtime" as const, pid: child.pid }; await new Promise(resolve => setTimeout(resolve, 500)); }
  return undefined;
}
async function workerDiscovery() { const url = (process.env.FORGE_WORKER_URL || process.env.WORKER_DISCOVERY_URL || "").replace(/\/+$/, ""); if (!url) return undefined; try { const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1800), headers: { accept: "application/json" } }); if (!response.ok) return { url, status: "offline" }; const capabilities = await response.json() as Record<string, unknown>; return { url, status: "online", capabilities }; } catch { return { url, status: "offline" }; } }
async function writeRuntime(config: RuntimeConfig) { try { await fs.writeFile(runtimePath(), JSON.stringify(config, null, 2), "utf8"); } catch { /* runtime is still available in memory */ } }

export async function bootstrapAiEngines(force = false): Promise<RuntimeConfig> {
  if (bootstrapPromise && !force) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const info = systemInfo(); const profile = profileFor(info); const models = await inspectModels(); const worker = await workerDiscovery();
    const imageFound = worker?.status === "online" && worker.capabilities?.image_generation ? { url: worker.url, source: "worker" as const } : await discoverUrl("image");
    const threeDFound = worker?.status === "online" && worker.capabilities?.three_d_generation ? { url: worker.url, source: "worker" as const } : await discoverUrl("threeD");
    const imageStarted = imageFound ?? await maybeStart("image", info); const threeDStarted = threeDFound ?? await maybeStart("threeD", info);
    const image: RuntimeEngine = imageStarted ? { kind: "image", type: "Flux/ComfyUI", url: imageStarted.url, status: "online", stage: "Gateway local conectado", progress: 100, source: imageStarted.source, pid: "pid" in imageStarted ? imageStarted.pid : undefined } : { kind: "image", type: "Flux/ComfyUI", status: process.env.COMFYUI_PATH ? "preparing" : "unavailable", stage: process.env.COMFYUI_PATH ? "Aguardando inicialização do ComfyUI" : "ComfyUI não detectado", progress: process.env.COMFYUI_PATH ? 35 : 0, source: "none", error: "Nenhum gateway local acessível" };
    const threeD: RuntimeEngine = threeDStarted ? { kind: "threeD", type: "Hunyuan3D-2.1", url: threeDStarted.url, status: "online", stage: "Motor 3D local conectado", progress: 100, source: threeDStarted.source, pid: "pid" in threeDStarted ? threeDStarted.pid : undefined } : { kind: "threeD", type: "Hunyuan3D-2.1", status: info.gpu ? "preparing" : "unavailable", stage: info.gpu ? "Hunyuan3D aguardando inicialização" : "GPU NVIDIA/CUDA não detectada neste runtime", progress: info.gpu ? 35 : 0, source: "none", error: info.gpu ? "Worker Hunyuan3D não encontrado" : "Este runtime não possui GPU compatível" };
    if (image.url && !process.env.IMAGE_ENGINE_URL) process.env.IMAGE_ENGINE_URL = image.url;
    if (threeD.url && !process.env.HUNYUAN3D_URL) process.env.HUNYUAN3D_URL = threeD.url;
    const config: RuntimeConfig = { version: 1, generatedAt: new Date().toISOString(), profile, environment: info, engines: { image, threeD }, models, worker, ready: image.status === "online" || threeD.status === "online", message: image.status === "online" && threeD.status === "online" ? "Forge3D pronto" : "Infraestrutura local parcialmente disponível" };
    cached = config; await writeRuntime(config); return config;
  })();
  try { return await bootstrapPromise; } finally { bootstrapPromise = undefined; }
}
export async function getAiRuntime(force = false) { if (force || !cached) return bootstrapAiEngines(force); return cached; }
export async function repairAiEngines() { managed.forEach(item => { if (item.process.exitCode === null) item.process.kill(); }); managed.clear(); return bootstrapAiEngines(true); }
export async function updateLocalModels() { const info = systemInfo(); const models = await inspectModels(); return { status: "ready", profile: profileFor(info), models, message: info.gpu ? "Modelos locais verificados; o worker controla downloads de pesos compatíveis." : "Modelos verificados; nenhum download iniciado porque a GPU local não foi detectada.", downloaded: false }; }
export async function stopAiEngines() { managed.forEach(item => item.process.kill()); managed.clear(); cached = undefined; return { status: "stopped" }; }
