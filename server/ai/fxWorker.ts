export type FxKind = "particulas" | "shader" | "animacao";
export type FxUse = "item" | "cenario" | "hud" | "ux";

export function runMockFx(input: { kind: FxKind; use: FxUse; prompt?: string }) {
  const labels = { particulas: "Partículas", shader: "Shader procedural", animacao: "Animação procedural" } as const;
  const uses = { item: "Item equipável", cenario: "Elemento de cenário", hud: "HUD de jogo", ux: "Experiência de UI/UX" } as const;
  return { worker: "forge-fx-mock", status: "completed" as const, progress: 100, stage: `${labels[input.kind]} preparado para ${uses[input.use]}`, kind: input.kind, use: input.use, prompt: input.prompt ?? "", preview: { loop: input.kind === "animacao", glow: input.kind === "shader", particles: input.kind === "particulas", material: input.kind === "shader" ? "emissive-gradient" : "standard", target: uses[input.use] } };
}
