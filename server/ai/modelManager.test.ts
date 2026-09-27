import { describe, expect, it } from "vitest";
import { inspectModels } from "./modelManager";

describe("Model Manager", () => {
  it("inspeciona o catálogo de modelos sem baixar nada automaticamente", async () => {
    const models = await inspectModels();
    expect(models.map(item => item.id)).toEqual(["hunyuan3d", "flux", "checkpoints", "vae", "loras"]);
    expect(models.every(item => ["ready", "missing", "preparing"].includes(item.state))).toBe(true);
  });
});
