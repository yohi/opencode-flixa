import type { Plugin } from "@opencode-ai/plugin";
const p: Plugin = async ({ client }) => {
  console.log(Object.keys(client));
  return {};
};
