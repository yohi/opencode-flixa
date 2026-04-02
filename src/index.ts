import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { Plugin } from "@opencode-ai/plugin";

import { getApiKey } from "../../flixa-cli/src/auth/service.js";
import { fetchAvailableModels, DEFAULT_FLIXA_BASE_URL } from "../../flixa-cli/src/flixa/api.js";

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const OPENCODE_CONFIG_JSON = join(OPENCODE_CONFIG_DIR, "opencode.json");
const FLIXA_PROVIDER_ID = "flixa";

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJson(path: string, data: Record<string, unknown>): void {
  const dir = join(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

import { setGlobalDispatcher, Agent } from "undici";

// Node 18+ の fetch (Undici) 向けに、自己署名証明書エラーを無視する設定
try {
  setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));
} catch (e) {}

import { fileURLToPath } from "node:url";
import tls from "node:tls";

// Electron環境や特定のランタイムで NODE_TLS_REJECT_UNAUTHORIZED = "0" が無視されるのを防ぐための強制パッチ
const origConnect = (tls as any).connect;
(tls as any).connect = function(...args: any[]) {
  if (args[0] && typeof args[0] === 'object') {
    args[0].rejectUnauthorized = false;
  } else if (args[1] && typeof args[1] === 'object') {
    args[1].rejectUnauthorized = false;
  }
  return origConnect.apply(this, args);
};

const _filename = fileURLToPath(import.meta.url);
const _dirname = join(_filename, "..");

export const FlixaPlugin: Plugin = async ({ client }) => {
  let isPluginStarting = true;
  
  // デバッグ用の一時ファイル作成 (動作確認できているため削除可能ですが残します)
  try { writeFileSync("/tmp/opencode-flixa-active", "active at " + new Date().toISOString()); } catch(e) {}

  // 企業プロキシなどで自己署名証明書による通信エラー (unable to verify the first certificate) が発生するのを防ぐ
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  (process.env as any).NODE_TLS_REJECT_UNAUTHORIZED = "0";

  // Background initialization
  (async () => {
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        await client.app.log({
          body: {
            service: "opencode-flixa",
            level: "warn",
            message: "Flixa is not logged in. Please run `flixa login` in your terminal to use Flixa models.",
          },
        });
        return;
      }

      const modelsDef = await fetchAvailableModels({ apiKey });
      const modelsMap: Record<string, { name: string }> = {};
      for (const m of modelsDef) {
        modelsMap[m.id] = { name: m.label || m.id };
      }

      const config = readJson(OPENCODE_CONFIG_JSON);
      if (typeof config.provider !== "object" || config.provider === null) {
        config.provider = {};
      }
      
      const provider = config.provider as Record<string, unknown>;
      let currentFlixa = provider[FLIXA_PROVIDER_ID] as Record<string, unknown> | undefined;

      if (!currentFlixa || typeof currentFlixa !== "object") {
        currentFlixa = {
          api: "responses",
          npm: "@ai-sdk/open-responses",
          options: {
            url: DEFAULT_FLIXA_BASE_URL.endsWith("/responses") ? DEFAULT_FLIXA_BASE_URL : `${DEFAULT_FLIXA_BASE_URL}/responses`,
          },
          models: modelsMap,
        };
        provider[FLIXA_PROVIDER_ID] = currentFlixa;
        writeJson(OPENCODE_CONFIG_JSON, config);
        await client.app.log({
          body: {
            service: "opencode-flixa",
            level: "info",
            message: `Flixa provider registered with ${modelsDef.length} models.`,
          },
        });
      } else {
        // Update models gracefully
        let providerModified = false;
        
        const existingModels = JSON.stringify(currentFlixa.models || {});
        const newModels = JSON.stringify(modelsMap);
        if (existingModels !== newModels) {
          currentFlixa.models = modelsMap;
          providerModified = true;
          await client.app.log({
            body: {
              service: "opencode-flixa",
              level: "info",
              message: `Flixa models updated from API (${modelsDef.length} models now). Please restart OpenCode to see them in the UI.`,
            },
          });
        }

        // Revert to native provider because TLS is globally patched now.
        // Also native provider is more stable for streaming.
        const targetNpm = "@ai-sdk/open-responses";
        if (currentFlixa.npm !== targetNpm) {
          currentFlixa.npm = targetNpm;
          providerModified = true;
        }
        
        // Migrate baseURL to url for open-responses
        if (currentFlixa.options && typeof currentFlixa.options === "object") {
           const opts = currentFlixa.options as Record<string, any>;
           if (opts.baseURL && !opts.url) {
              opts.url = opts.baseURL.endsWith("/responses") ? opts.baseURL : `${opts.baseURL}/responses`;
              delete opts.baseURL;
              providerModified = true;
           }
        }

        if (providerModified) {
          writeJson(OPENCODE_CONFIG_JSON, config);
        }
      }
    } catch (e) {
      await client.app.log({
        body: {
          service: "opencode-flixa",
          level: "warn",
          message: `Failed to refresh models: ${e instanceof Error ? e.message : String(e)}`,
        },
      });
    } finally {
      isPluginStarting = false;
    }
  })();

  return {
    "shell.env": async (_input, output) => {
      const apiKey = getApiKey();
      if (apiKey) {
        output.env.FLIXA_API_KEY = apiKey;
      }
    },
  };
};
