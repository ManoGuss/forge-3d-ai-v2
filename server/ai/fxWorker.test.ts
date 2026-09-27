import { describe, expect, it } from "vitest";
import { runMockFx } from "./fxWorker";

describe("worker FX mock", () => {
  it("retorna preview procedural contextual sem motor externo", () => {
    const result = runMockFx({ kind: "particulas", use: "hud", prompt: "faíscas verdes" });
    expect(result.status).toBe("completed");
    expect(result.progress).toBe(100);
    expect(result.preview.particles).toBe(true);
    expect(result.preview.target).toBe("HUD de jogo");
  });
});
