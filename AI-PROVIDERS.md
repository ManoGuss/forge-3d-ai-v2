# Engines locais do Forge3D

## Princípio

O fluxo principal do Forge3D não depende de créditos, tokens ou APIs comerciais de geração. O navegador fala apenas com o backend do Forge; o backend conversa com engines locais/self-hosted configuráveis.

## 3D: Hunyuan3D-2.1

O adapter `server/providers/threeD.ts` usa a API FastAPI documentada oficialmente pelo projeto Tencent Hunyuan3D-2.1:

- `POST /send` inicia uma geração assíncrona.
- `GET /status/{uid}` consulta o job.
- `GET /health` verifica a infraestrutura.

Configure no servidor:

```text
HUNYUAN3D_URL=http://127.0.0.1:8081
```

A entrada é uma imagem de referência em data URL, acompanhada do prompt e dos parâmetros de textura/contagem de faces. Ao concluir, o adapter salva o `model_base64` retornado como GLB no storage do projeto. Sem `HUNYUAN3D_URL`, a aplicação mostra “Motor Hunyuan3D local indisponível” e não fabrica um modelo.

Requisitos oficiais publicados pelo projeto incluem Linux, Python 3.8+, CUDA e NVIDIA GPU com pelo menos 24 GB para Hunyuan3D-2.1 (confira o README do repositório antes de instalar). O sandbox atual não possui NVIDIA/CUDA, portanto não tenta instalar ou fingir uma inferência local.

## Concept: Flux/ComfyUI local

O adapter `server/providers/image.ts` conversa com um gateway local de concept configurado por:

```text
IMAGE_ENGINE_URL=http://127.0.0.1:8188/forge/concept
COMFYUI_URL=http://127.0.0.1:8188
AI_ENGINE_URL=http://127.0.0.1:9000
```

O gateway recebe `{ prompt, style, references, constraints }` e deve devolver `{ url }` ou `{ dataUrl }`. A interface não expõe nodes, CUDA ou parâmetros internos. Sem `IMAGE_ENGINE_URL`, o botão de concept fica indisponível com instrução administrativa clara.

## Health e fallback

`providers.health` chama o `/health` oficial do Hunyuan3D quando configurado e retorna engine, GPU, VRAM e status. Não existe fallback automático para Tripo, Meshy ou outro serviço pago.

O código preserva os adapters de exportação, viewer 3D, snapshots, histórico, doodle, gizmos e banco de projetos. O foco da UI foi reduzido para uma única janela Forge com abas Criar, Desenhar, 3D, Efeitos e Projeto.

## Licenças

Hunyuan3D-2.1 é distribuído pelo repositório oficial Tencent-Hunyuan. Verifique o arquivo de licença e os termos dos pesos antes de uso comercial ou redistribuição. Flux/ComfyUI deve ser instalado com pesos e licença compatíveis com o uso pretendido.
