import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext { return { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] }; }

describe("contratos do gateway local Forge", () => {
  it("reporta engines locais sem expor segredos", async () => {
    const result = await appRouter.createCaller(createContext()).providers.status();
    expect(result.image.id).toBe("flux-local-gateway");
    expect(result.threeD.id).toBe("hunyuan3d-local");
    expect(result).not.toHaveProperty("apiKey");
    expect(result).not.toHaveProperty("endpoint");
    expect(result.note).toContain("engines locais");
  });

  it("reporta honestamente quando o motor Hunyuan3D não está configurado", async () => {
    if (process.env.HUNYUAN3D_URL) return;
    const result = await appRouter.createCaller(createContext()).providers.health();
    expect(result.threeD.available).toBe(false);
    expect(result.threeD.engine).toBe("Hunyuan3D-2.1");
    expect(result.threeD.urlConfigured).toBe(false);
  });

  it("não fabrica um modelo sem engine local configurado", async () => {
    if (process.env.HUNYUAN3D_URL) return;
    await expect(appRouter.createCaller(createContext()).forge.generate3D({ prompt: "uma espada de cristal", polygonCount: "40K", textureQuality: "High" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("não fabrica um concept sem gateway de imagem local configurado", async () => {
    if (process.env.IMAGE_ENGINE_URL) return;
    await expect(appRouter.createCaller(createContext()).forge.generateConcept({ projectName: "Teste", prompt: "uma espada de cristal", style: "Pronto para jogo" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejeita identificador inválido de snapshot na borda da API", async () => {
    await expect(appRouter.createCaller(createContext()).snapshots.list({ projectId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
