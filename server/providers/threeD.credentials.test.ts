import { describe, expect, it } from "vitest";

describe("Tripo credentials", () => {
  it("accepts the configured server key at the official balance endpoint", async () => {
    const apiKey = process.env.TRIPO_API_KEY;
    if (!apiKey) return;

    const response = await fetch("https://openapi.tripo3d.ai/v3/account/balance", {
      headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" },
    });
    const body = (await response.json()) as { code?: number; message?: string };

    expect(response.status, body.message ?? "Tripo credentials rejected").toBe(200);
    expect(body.code).toBe(0);
  }, 30000);
});
