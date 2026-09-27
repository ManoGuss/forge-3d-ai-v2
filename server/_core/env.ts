export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  imageEngineUrl: process.env.IMAGE_ENGINE_URL ?? "",
  comfyUiUrl: process.env.COMFYUI_URL ?? "",
  hunyuan3dUrl: process.env.HUNYUAN3D_URL ?? "",
  aiEngineUrl: process.env.AI_ENGINE_URL ?? "",
};
