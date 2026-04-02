import type { Plugin } from "@opencode-ai/plugin";

/**
 * A test plugin instance to verify OpenCode plugin host client.
 */
export const FlixaTestPlugin: Plugin = async ({ client }) => {
  console.log("Client keys:", Object.keys(client));
  return {
    "shell.env": async () => {
       // Example environment injection
    }
  };
};

export default FlixaTestPlugin;
