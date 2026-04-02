import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import https from "node:https";
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
  const dir = dirname(path);
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

export const FlixaPlugin: Plugin = async ({ client }) => {
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

      // 企業プロキシなどで自己署名証明書による通信エラーが発生するのを防ぐ
      const disableTlsVerify = process.env.DISABLE_TLS_VERIFY === "true" || process.env.ENABLE_PROXY_INSECURE === "true";
      const agent = new https.Agent({ rejectUnauthorized: !disableTlsVerify });

      const modelsDef = await fetchAvailableModels({ apiKey, agent: agent as any });
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

      if (typeof config.provider !== "object" || config.provider === null || Array.isArray(config.provider)) {
        config.provider = {};
      }
      
      const provider = config.provider as Record<string, unknown>;
      let currentFlixa = provider[FLIXA_PROVIDER_ID] as Record<string, any> | undefined;

      const normalizedUrl = DEFAULT_FLIXA_BASE_URL.endsWith("/responses") ? DEFAULT_FLIXA_BASE_URL : `${DEFAULT_FLIXA_BASE_URL}/responses`;
      const targetNpm = "@ai-sdk/open-responses";

      if (!currentFlixa || typeof currentFlixa !== "object" || Array.isArray(currentFlixa)) {
        currentFlixa = {
          api: "responses",
          npm: targetNpm,
          options: {
            url: normalizedUrl,
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

        if (currentFlixa.api !== "responses") {
          currentFlixa.api = "responses";
          providerModified = true;
        }

        if (currentFlixa.npm !== targetNpm) {
          currentFlixa.npm = targetNpm;
          providerModified = true;
        }

        if (typeof currentFlixa.options !== "object" || currentFlixa.options === null || Array.isArray(currentFlixa.options)) {
          currentFlixa.options = { url: normalizedUrl };
          providerModified = true;
        } else {
          const opts = currentFlixa.options as Record<string, any>;
          if (opts.baseURL && !opts.url) {
            opts.url = opts.baseURL.endsWith("/responses") ? opts.baseURL : `${opts.baseURL}/responses`;
            delete opts.baseURL;
            providerModified = true;
          }
          if (!opts.url) {
             opts.url = normalizedUrl;
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
      try {
        const apiKey = getApiKey();
        if (apiKey) {
          process.env.FLIXA_API_KEY = apiKey;
          output.env.FLIXA_API_KEY = apiKey;
        } else {
          delete process.env.FLIXA_API_KEY;
          delete output.env.FLIXA_API_KEY;
        }
      } catch (e) {
        delete process.env.FLIXA_API_KEY;
        delete output.env.FLIXA_API_KEY;
      }
    },
  };
};

