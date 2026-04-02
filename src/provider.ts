import { createOpenResponses } from "@ai-sdk/open-responses";
import { setGlobalDispatcher, Agent, fetch as undiciFetch } from "undici";
import { getApiKey } from "@deniai/flixa/auth/service";
import https from "node:https";

export interface CreateProviderOptions {
  baseURL?: string;
  apiKey?: string;
}

// TLS検証を無効化するかどうかの判定
const disableTlsVerify = process.env.DISABLE_TLS_VERIFY === "true" || process.env.ENABLE_PROXY_INSECURE === "true";

// 共通のエージェント設定
const agentArgs = { 
  connect: { 
    rejectUnauthorized: !disableTlsVerify 
  } 
};

// Undiciのグローバルディスパッチャー設定 (一度だけ実行)
let sharedAgent: Agent | undefined;
try {
  sharedAgent = new Agent(agentArgs);
  setGlobalDispatcher(sharedAgent);
} catch (e) {
  console.error("Failed to initialize global Undici Agent:", e);
}

// HTTPS用のエージェントも再利用 (Node.jsのネイティブモジュール用)
const sharedHttpsAgent = new https.Agent({ 
  rejectUnauthorized: !disableTlsVerify 
});

const customFetch = async (input: string | URL | Request, init?: RequestInit) => {
  const options: RequestInit & { dispatcher?: any, agent?: any } = { ...init };
  
  if (sharedAgent) {
    options.dispatcher = sharedAgent;
  }
  options.agent = sharedHttpsAgent;
  
  // Use pure undici fetch
  return undiciFetch(input as any, options as any);
};

export const createProvider = (options: CreateProviderOptions = {}) => {
  const baseUrl = options.baseURL || "https://api.flixa.engineer/v1/agent";
  const url = baseUrl.endsWith("/responses") ? baseUrl : `${baseUrl}/responses`;
  const apiKey = options.apiKey || process.env.FLIXA_API_KEY || getApiKey();
  
  return createOpenResponses({
    name: "flixa",
    url: url,
    apiKey: apiKey,
    fetch: customFetch as any
  });
};

export default createProvider;
