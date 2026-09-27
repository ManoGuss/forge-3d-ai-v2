import { describe, expect, it } from "vitest";
import { getAiRuntime } from "./engineManager";

describe("AI Engine Manager", () => {
  it("detecta o runtime sem inventar engines online", async () => {
    const runtime = await getAiRuntime(true);
    expect(runtime.version).toBe(1);
    expect(runtime.environment.node).toMatch(/^v\d+/);
    expect(runtime.engines.image.kind).toBe("image");
    expect(runtime.engines.threeD.kind).toBe("threeD");
    if (!runtime.environment.gpu) expect(runtime.engines.threeD.status).not.toBe("online");
  });
});
