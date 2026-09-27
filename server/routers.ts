import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { generateImage } from "./_core/imageGeneration";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { createForgeGeneration, createForgeProject, listForgeProjects } from "./db";
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
  providers: router({ status: publicProcedure.query(() => getProviderStatus()) }),
  projects: router({
    list: publicProcedure.query(({ ctx }) => listForgeProjects(ctx.user?.id)),
    create: publicProcedure.input(z.object({ name: z.string().min(1).max(180) })).mutation(async ({ ctx, input }) => {
      const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
      const id = await createForgeProject({ name: input.name, slug, userId: ctx.user?.id });
      return { id, name: input.name, slug, persisted: Boolean(id) };
    }),
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
      if (!provider) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "3D provider not configured. Set THREE_D_PROVIDER_URL and THREE_D_PROVIDER_API_KEY on the server." });
      return provider.generate(input);
    }),
    jobStatus: publicProcedure.input(z.object({ jobId: z.string().min(1) })).query(async ({ input }) => {
      const provider = getThreeDProvider();
      if (!provider) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "3D provider not configured." });
      return provider.getStatus(input.jobId);
    }),
  }),
});

export type AppRouter = typeof appRouter;
