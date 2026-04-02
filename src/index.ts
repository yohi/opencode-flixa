import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { Plugin } from "@opencode-ai/plugin";

// @deniai/flixa (local package) からインポートするように修正
import { getApiKey } from "@deniai/flixa/auth/service";
import { fetchAvailableModels, DEFAULT_FLIXA_BASE_URL } from "@deniai/flixa/flixa/api";

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const OPENCODE_CONFIG_JSON = join(OPENCODE_CONFIG_DIR, "opencode.json");
const FLIXA_PROVIDER_ID = "flixa";

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: Record<string, unknown>): void {
  const dir = join(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

// 決定論的なモデル比較のためのユーティリティ（ネストされたプロパティも考慮）
function sortObjectDeep(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectDeep);
  return Object.keys(obj)
    .sort()
    .reduce((acc: any, key) => {
      acc[key] = sortObjectDeep(obj[key]);
      return acc;
    }, {});
}

function areModelsEqual(a: any, b: any): boolean {
  return JSON.stringify(sortObjectDeep(a)) === JSON.stringify(sortObjectDeep(b));
}

import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);
const _dirname = join(_filename, "..");

export const FlixaPlugin: Plugin = async ({ client }) => {
  // 企業プロキシなどで自己署名証明書による通信エラーが発生するのを防ぐ
  // (特定の環境でのみ有効にするか、provider側で制御するのが望ましいが、OpenCode全体の動作に影響するため一旦残す)
  if (process.env.DISABLE_TLS_VERIFY === "true" || process.env.ENABLE_PROXY_INSECURE === "true") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

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
      if (config === null) {
        await client.app.log({
          body: {
            service: "opencode-flixa",
            level: "warn",
            message: "Skipping Flixa sync because opencode.json is malformed.",
          },
        });
        return;
      }

      if (typeof config.provider !== "object" || config.provider === null) {
        config.provider = {};
      }
      
      const provider = config.provider as Record<string, unknown>;
      let currentFlixa = provider[FLIXA_PROVIDER_ID] as Record<string, any> | undefined;

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
        
        if (!areModelsEqual(currentFlixa.models, modelsMap)) {
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
