import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

export type ModelState = "ready" | "missing" | "preparing";
export type ModelEntry = { id: string; label: string; path: string; state: ModelState; bytes: number };
const root = () => process.env.FORGE_MODELS_PATH || path.join(process.cwd(), "models");
async function sizeOf(target: string): Promise<number> { try { const stat = await fs.stat(target); if (stat.isFile()) return stat.size; const children = await fs.readdir(target); return (await Promise.all(children.map(child => sizeOf(path.join(target, child))))).reduce((total, value) => total + value, 0); } catch { return 0; } }
export async function inspectModels(): Promise<ModelEntry[]> { const base = root(); const items = [{ id: "hunyuan3d", label: "Hunyuan3D-2.1", path: path.join(base, "hunyuan3d") }, { id: "flux", label: "Flux", path: path.join(base, "flux") }, { id: "checkpoints", label: "Checkpoints", path: path.join(base, "checkpoints") }, { id: "vae", label: "VAE", path: path.join(base, "vae") }, { id: "loras", label: "LoRAs", path: path.join(base, "loras") }]; return Promise.all(items.map(async item => ({ ...item, state: existsSync(item.path) ? "ready" as const : "missing" as const, bytes: await sizeOf(item.path) })));
}
