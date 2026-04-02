import { createOpenResponses } from "@ai-sdk/open-responses";
import { setGlobalDispatcher, Agent, fetch as undiciFetch } from "undici";
import { getApiKey } from "../../flixa-cli/src/auth/service.js";
import https from "node:https";

const agentArgs = { connect: { rejectUnauthorized: false } };

try {
  setGlobalDispatcher(new Agent(agentArgs));
} catch (e) {}

// HTTPS用のエージェントも念のため設定 (Node.jsのネイティブモジュール用)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const customFetch = async (input: string | URL | Request, init?: RequestInit) => {
  const options: RequestInit & { dispatcher?: any, agent?: any } = { ...init };
  
  if (typeof Agent !== 'undefined') {
      try {
          options.dispatcher = new Agent(agentArgs);
          options.agent = httpsAgent; // Some fetch polyfills use node-fetch and require `agent`
      } catch(e) {}
  }
  
  // Use pure undici fetch instead of global which might be heavily patched
  return undiciFetch(input as any, options as any);
};

export const createProvider = (options: any = {}) => {
  // api.flixa.engineer/v1/agent requires /responses for open-responses
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
