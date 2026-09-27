import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { generateImage } from "./_core/imageGeneration";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { createForgeGeneration, createForgeProject, createForgeSnapshot, deleteForgeSnapshot, listForgeProjects, listForgeSnapshots } from "./db";
import { getProviderStatus, getThreeDProvider } from "./providers/threeD";
import { storagePut } from "./storage";

const imageInput = z.object({ url: z.string().optional(), b64Json: z.string().optional(), mimeType: z.string().optional() });
const promptInput = z.object({ projectId: z.number().optional(), projectName: z.string().min(1).max(180), prompt: z.string().min(3).max(6000), style: z.string().min(1).max(64), originalImages: z.array(imageInput).max(6).optional() });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
  }),
  providers: router({
    status: publicProcedure.query(() => getProviderStatus()),
    credits: publicProcedure.query(async () => {
      const provider = getThreeDProvider();
      if (!provider?.getCreditStatus) return { available: false, message: "No credit-aware 3D provider is configured." };
      return provider.getCreditStatus();
    }),
  }),
  projects: router({
    list: publicProcedure.query(({ ctx }) => listForgeProjects(ctx.user?.id)),
    create: publicProcedure.input(z.object({ name: z.string().min(1).max(180) })).mutation(async ({ ctx, input }) => {
      const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
      const id = await createForgeProject({ name: input.name, slug, userId: ctx.user?.id });
      return { id, name: input.name, slug, persisted: Boolean(id) };
    }),
  }),
  snapshots: router({
    list: publicProcedure.input(z.object({ projectId: z.number().int().positive() })).query(({ input }) => listForgeSnapshots(input.projectId)),
    create: publicProcedure.input(z.object({ projectId: z.number().int().positive(), label: z.string().min(1).max(180), prompt: z.string().max(6000), style: z.string().max(64), doodleUrl: z.string().optional(), referencesJson: z.string().optional(), transformJson: z.string().optional(), conceptUrl: z.string().optional(), modelUrl: z.string().optional() })).mutation(async ({ input }) => ({ id: await createForgeSnapshot(input), label: input.label })),
    remove: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => deleteForgeSnapshot(input.id)),
  }),
  assets: router({
    uploadReference: publicProcedure.input(z.object({ dataUrl: z.string().min(30), filename: z.string().max(160), mimeType: z.string().max(120) })).mutation(async ({ input }) => {
      const match = input.dataUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Referência inválida: esperado data URL base64." });
      const result = await storagePut(`references/${Date.now()}-${input.filename}`, Buffer.from(match[1], "base64"), input.mimeType);
      return { url: result.url, key: result.key };
    }),
  }),
  forge: router({
    generateConcept: publicProcedure.input(promptInput).mutation(async ({ input }) => {
      const enhancedPrompt = [input.prompt, `Visual direction: ${input.style}.`, "Create a clean, production-minded concept reference for a real-time 3D asset.", "Neutral studio lighting, readable silhouette, front three-quarter view, no text, no watermark."].join(" ");
      const generationId = await createForgeGeneration({ projectId: input.projectId, prompt: input.prompt, style: input.style, status: "pending", provider: "forge-image-service" });
      try {
        const result = await generateImage({ prompt: enhancedPrompt, originalImages: input.originalImages });
        if (!result.url) throw new Error("Image provider returned no asset URL");
        await createForgeGeneration({ projectId: input.projectId, prompt: input.prompt, style: input.style, status: "completed", conceptUrl: result.url, provider: "forge-image-service" });
        return { url: result.url, enhancedPrompt, generationId, provider: "forge-image-service" };
      } catch (error) {
        await createForgeGeneration({ projectId: input.projectId, prompt: input.prompt, style: input.style, status: "failed", provider: "forge-image-service", error: error instanceof Error ? error.message : "Unknown image provider error" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Image generation failed" });
      }
    }),
    generate3D: publicProcedure.input(z.object({ prompt: z.string().min(3), conceptUrl: z.string().optional(), polygonCount: z.string(), textureQuality: z.string() })).mutation(async ({ input }) => {
      const provider = getThreeDProvider();
      if (!provider) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "3D provider not configured. Add TRIPO_API_KEY as a server secret (or configure a self-hosted worker). No fake model was created." });
      try {
        return await provider.generate(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : "3D generation could not start.";
        if (/credit|balance|purchase more/i.test(message)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${message} No generation task was created.` });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),
    jobStatus: publicProcedure.input(z.object({ jobId: z.string().min(1) })).query(async ({ input }) => {
      const provider = getThreeDProvider();
      if (!provider) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "3D provider not configured. Add TRIPO_API_KEY as a server secret." });
      return provider.getStatus(input.jobId);
    }),
    cancelJob: publicProcedure.input(z.object({ jobId: z.string().min(1) })).mutation(async ({ input }) => {
      const provider = getThreeDProvider();
      if (!provider) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "3D provider not configured. Add TRIPO_API_KEY as a server secret." });
      return provider.cancel(input.jobId);
    }),
  }),
});

export type AppRouter = typeof appRouter;
