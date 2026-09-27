import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("forge provider contracts", () => {
  it("reports provider readiness without exposing server credentials", async () => {
    const result = await appRouter.createCaller(createContext()).providers.status();
    expect(result.image.id).toBe("forge-image-service");
    expect(result).not.toHaveProperty("apiKey");
    expect(result).not.toHaveProperty("endpoint");
    expect(typeof result.threeD.configured).toBe("boolean");
    expect(result.localEngine.engine).toBe("TRELLIS.2");
    expect(result.localEngine.gpuAvailable).toBe(false);
  });

  it("does not fabricate a 3D asset when no provider is configured", async () => {
    if (process.env.TRIPO_API_KEY || (process.env.THREE_D_PROVIDER_URL && process.env.THREE_D_PROVIDER_API_KEY)) return;
    await expect(appRouter.createCaller(createContext()).forge.generate3D({
      prompt: "a compact sci-fi explorer robot",
      polygonCount: "20K",
      textureQuality: "High",
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("does not poll a fabricated job when no provider is configured", async () => {
    if (process.env.TRIPO_API_KEY || (process.env.THREE_D_PROVIDER_URL && process.env.THREE_D_PROVIDER_API_KEY)) return;
    await expect(appRouter.createCaller(createContext()).forge.jobStatus({ jobId: "job-from-provider" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("does not cancel a fabricated job when no provider is configured", async () => {
    if (process.env.TRIPO_API_KEY || (process.env.THREE_D_PROVIDER_URL && process.env.THREE_D_PROVIDER_API_KEY)) return;
    await expect(appRouter.createCaller(createContext()).forge.cancelJob({ jobId: "job-from-provider" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects invalid snapshot project identifiers at the API boundary", async () => {
    await expect(appRouter.createCaller(createContext()).snapshots.list({ projectId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
