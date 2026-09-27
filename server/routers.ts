import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { createForgeGeneration, createForgeProject, createForgeSnapshot, deleteForgeSnapshot, listForgeProjects, listForgeSnapshots } from "./db";
import { generateLocalConcept, getLocalConceptStatus, getLocalImageHealth, isLocalImageConfigured } from "./providers/image";
import { getLocalEngineHealth, getProviderStatus, getThreeDProvider } from "./providers/threeD";
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
    health: publicProcedure.query(async () => ({ image: await getLocalImageHealth(), threeD: await getLocalEngineHealth() })),
  }),
  projects: router({
    list: publicProcedure.query(({ ctx }) => listForgeProjects(ctx.user?.id)),
    create: publicProcedure.input(z.object({ name: z.string().min(1).max(180) })).mutation(async ({ ctx, input }) => { const slug = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`; const id = await createForgeProject({ name: input.name, slug, userId: ctx.user?.id }); return { id, name: input.name, slug, persisted: Boolean(id) }; }),
  }),
  snapshots: router({
    list: publicProcedure.input(z.object({ projectId: z.number().int().positive() })).query(({ input }) => listForgeSnapshots(input.projectId)),
    create: publicProcedure.input(z.object({ projectId: z.number().int().positive(), label: z.string().min(1).max(180), prompt: z.string().max(6000), style: z.string().max(64), doodleUrl: z.string().optional(), referencesJson: z.string().optional(), transformJson: z.string().optional(), conceptUrl: z.string().optional(), modelUrl: z.string().optional() })).mutation(async ({ input }) => ({ id: await createForgeSnapshot(input), label: input.label })),
    remove: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => deleteForgeSnapshot(input.id)),
  }),
  assets: router({
    uploadReference: publicProcedure.input(z.object({ dataUrl: z.string().min(30), filename: z.string().max(160), mimeType: z.string().max(120) })).mutation(async ({ input }) => { const match = input.dataUrl.match(/^data:[^;]+;base64,(.+)$/); if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Referência inválida: esperado data URL base64." }); const result = await storagePut(`references/${Date.now()}-${input.filename}`, Buffer.from(match[1], "base64"), input.mimeType); return { url: result.url, key: result.key }; }),
  }),
  forge: router({
    generateConcept: publicProcedure.input(promptInput).mutation(async ({ input }) => {
      if (!isLocalImageConfigured()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Motor de concept local indisponível. Configure IMAGE_ENGINE_URL para conectar Flux/ComfyUI. Nenhuma API paga será usada." });
      const enhancedPrompt = [input.prompt, `Direção visual: ${input.style}.`, "Concept para reconstrução 3D: objeto único, inteiro visível, centralizado, fundo neutro, iluminação de estúdio, sem texto e sem marca d'água."].join(" ");
      const generationId = await createForgeGeneration({ projectId: input.projectId, prompt: input.prompt, style: input.style, status: "pending", provider: "flux-local-gateway" });
      try {
        const result = await generateLocalConcept({ prompt: enhancedPrompt, style: input.style, originalImages: input.originalImages });
        if (result.status === "completed" && result.url) await createForgeGeneration({ projectId: input.projectId, prompt: input.prompt, style: input.style, status: "completed", conceptUrl: result.url, provider: result.provider });
        return { ...result, enhancedPrompt, generationId };
      } catch (error) {
        await createForgeGeneration({ projectId: input.projectId, prompt: input.prompt, style: input.style, status: "failed", provider: "flux-local-gateway", error: error instanceof Error ? error.message : "Falha no motor de concept local" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Falha no motor de concept local" });
      }
    }),
    conceptStatus: publicProcedure.input(z.object({ jobId: z.string().min(1) })).query(({ input }) => getLocalConceptStatus(input.jobId)),
    generate3D: publicProcedure.input(z.object({ prompt: z.string().min(3), conceptUrl: z.string().optional(), polygonCount: z.string(), textureQuality: z.string() })).mutation(async ({ input }) => {
      const provider = getThreeDProvider();
      if (!provider) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Motor Hunyuan3D local indisponível. Configure HUNYUAN3D_URL no servidor. Nenhum modelo foi criado." });
      try { return await provider.generate(input); } catch (error) { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Falha ao iniciar a geração 3D local" }); }
    }),
    jobStatus: publicProcedure.input(z.object({ jobId: z.string().min(1) })).query(async ({ input }) => { const provider = getThreeDProvider(); if (!provider) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Motor Hunyuan3D local indisponível." }); return provider.getStatus(input.jobId); }),
    cancelJob: publicProcedure.input(z.object({ jobId: z.string().min(1) })).mutation(async ({ input }) => { const provider = getThreeDProvider(); if (!provider) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Motor Hunyuan3D local indisponível." }); return provider.cancel(input.jobId); }),
  }),
});

export type AppRouter = typeof appRouter;
