import { describe, expect, it } from "vitest";
import { getLocalEngineHealth, getProviderStatus } from "./threeD";

describe("gateway Hunyuan3D local", () => {
  it("não expõe credenciais comerciais nem promete disponibilidade sem URL", () => {
    const status = getProviderStatus();
    expect(["hunyuan3d-local", "huggingface-hunyuan-space"]).toContain(status.threeD.id);
    expect(status).not.toHaveProperty("apiKey");
    expect(status).not.toHaveProperty("billing");
    if (!process.env.HUNYUAN3D_URL && process.env.DISABLE_HUGGINGFACE_SPACES === "1") expect(status.threeD.configured).toBe(false);
  });

  it("expõe health como indisponível quando nenhum worker local foi configurado", async () => {
    if (process.env.HUNYUAN3D_URL) return;
    const health = await getLocalEngineHealth();
    expect(health).toMatchObject({ available: false, engine: "Hunyuan3D-2.1", urlConfigured: false });
  });
});
