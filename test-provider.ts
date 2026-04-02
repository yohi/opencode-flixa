import { createProvider } from "./src/provider.ts";
import { generateText } from "ai";

async function test() {
  console.log("Testing Flixa Provider...");
  try {
    const provider = createProvider();
    const model = provider("openai/gpt-5.4");
    
    console.log("Sending request to Flixa...");
    const { text } = await generateText({
      model,
      prompt: "Hello, reply with 'Connection Successful'",
    });
    
    console.log("Response:", text);
  } catch (error) {
    console.error("Test Failed:", error);
  }
}

test();
