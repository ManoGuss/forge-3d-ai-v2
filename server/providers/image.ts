type ImageInput = { url?: string; b64Json?: string; mimeType?: string };

type LocalImageResponse = { url?: string; dataUrl?: string; provider?: string };

function gatewayUrl() {
  return (process.env.IMAGE_ENGINE_URL ?? "").replace(/\/+$/, "");
}

export function isLocalImageConfigured() {
  return Boolean(gatewayUrl());
}

export async function generateLocalConcept(input: { prompt: string; style: string; originalImages?: ImageInput[] }) {
  const url = gatewayUrl();
  if (!url) throw new Error("Motor de concept local indisponível. Configure IMAGE_ENGINE_URL para conectar Flux/ComfyUI.");
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      style: input.style,
      references: input.originalImages ?? [],
      constraints: ["objeto único", "inteiro visível", "centralizado", "fundo neutro", "iluminação de estúdio", "sem texto", "sem marca d'água"],
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Motor de concept local respondeu ${response.status}: ${body || response.statusText}`);
  let payload: LocalImageResponse;
  try { payload = JSON.parse(body) as LocalImageResponse; } catch { throw new Error("O motor de concept local retornou uma resposta inválida."); }
  const result = payload.url ?? payload.dataUrl;
  if (!result) throw new Error("O motor de concept local não retornou uma imagem.");
  return { url: result, provider: payload.provider ?? "flux-local-gateway" };
}
