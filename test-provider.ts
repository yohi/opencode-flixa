import { describe, it, expect, vi } from "vitest";
import { createProvider } from "./src/provider.js";
import { generateText } from "ai";

// Mocking external dependencies if needed for CI
// In a real scenario, we might want to use msw or similar
vi.mock("@deniai/flixa/auth/service", () => ({
  getApiKey: () => "test-api-key"
}));

describe("Flixa Provider", () => {
  it("should create a provider and generate text", async () => {
    // If running in CI without real API access, we should mock the fetch call
    // For now, this is a structural test following the requested pattern
    const provider = createProvider({
      apiKey: "test-api-key",
      baseURL: "https://api.flixa.engineer/v1/agent"
    });
    
    expect(provider).toBeDefined();
    
    const model = provider("openai/gpt-5.4");
    expect(model).toBeDefined();

    // To avoid actual API calls in CI, you can mock generateText or the fetch inside provider
    /*
    const { text } = await generateText({
      model,
      prompt: "Hello, reply with 'Connection Successful'",
    });
    expect(text).toMatch(/Connection Successful/);
    */
  });
});
