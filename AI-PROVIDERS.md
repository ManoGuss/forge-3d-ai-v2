# Providers de IA do Forge3D

## Arquitetura híbrida gratuita

O fluxo principal agora prioriza **Hugging Face Spaces públicos via Gradio Client**, sem Inference Providers, billing, créditos pré-pagos ou APIs comerciais:

1. `black-forest-labs/FLUX.1-schnell` → concept
2. `tencent/Hunyuan3D-2` → GLB
3. `microsoft/TRELLIS.2` → fallback gratuito de imagem para 3D
4. Worker/local Flux e Hunyuan3D continuam opcionais para desenvolvimento/admin

O backend conecta uma vez, executa `view_api()`, descobre os endpoints e parâmetros reais do Space e guarda a conexão em cache. Nenhum endpoint `/predict`, `/infer` ou nome de parâmetro é assumido sem consultar o schema retornado pelo Space.

## Fluxo de geração

- Texto em português é preservado e enviado com `promptLanguage: pt-BR`.
- O endpoint de concept é descoberto por parâmetros que indiquem prompt e geração de imagem.
- O resultado é baixado e salvo no storage do Forge em `generations/{timestamp}/concept.png`.
- O frontend recebe uma URL interna do Forge, não fica dependente da URL temporária do Space.

## Fluxo 3D

- O endpoint compatível é descoberto por parâmetros de caption/texto e/ou imagem.
- O concept é enviado como arquivo via `handle_file` do Gradio Client.
- A saída é baixada e salva como `generations/{timestamp}/model.glb`.
- Se o Hunyuan3D estiver indisponível, o registry tenta TRELLIS.2, sem fallback pago.

## Disponibilidade e cota

Os Spaces podem dormir, acordar, entrar em fila, falhar ou atingir limites gratuitos. O Forge traduz esses estados para mensagens amigáveis e não marca o provider como pronto sem conectar, descobrir endpoint, executar a chamada, baixar o resultado e validar que o arquivo não está vazio.

Quando houver cota/rate limit/queue indisponível, a mensagem é: **“A cota gratuita do motor de IA foi atingida. Tente novamente mais tarde.”** Não há compra automática, cobrança, token obrigatório ou troca para provider pago.

## Providers locais opcionais

`IMAGE_ENGINE_URL`, `HUNYUAN3D_URL`, `COMFYUI_URL` e `FORGE_WORKER_URL` permanecem compatíveis para workers próprios, mas não são necessários para o uso normal quando os Spaces gratuitos estão acessíveis.
