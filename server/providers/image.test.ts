import { describe, expect, it } from "vitest";
import { generateLocalConcept, isLocalImageConfigured } from "./image";

describe("gateway de concept local", () => {
  it("requer IMAGE_ENGINE_URL antes de tentar qualquer geração", async () => {
    if (process.env.IMAGE_ENGINE_URL) return;
    expect(isLocalImageConfigured()).toBe(false);
    await expect(generateLocalConcept({ prompt: "objeto", style: "Pronto para jogo" })).rejects.toThrow(/IMAGE_ENGINE_URL/);
  });
});
