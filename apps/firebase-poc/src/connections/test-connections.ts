import OpenAI from "openai";
import { from, Observable } from "rxjs";
import type { ApiKeys } from "./storage";

export interface TestConnectionRequest {
  provider: "openai" | "together" | "gemini";
  apiKeys: ApiKeys;
}

export function testOpenAIConnection(apiKey: string): Observable<string> {
  const request = async (): Promise<string> => {
    const openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    const response = await openai.responses.create({
      model: "gpt-5-nano",
      input: "Please respond with exactly 'OpenAI test success!'",
      reasoning: { effort: "minimal" },
      text: { verbosity: "low" },
    });

    const firstTextResponse = response.output?.find((item) => item.type === "message")?.content?.find((part) => part.type === "output_text")?.text;
    if (firstTextResponse) return firstTextResponse;

    return "No response received from OpenAI";
  };

  return from(request());
}

export function testConnection({ provider, apiKeys }: TestConnectionRequest): Observable<string> {
  switch (provider) {
    case "openai":
      if (!apiKeys.openai) {
        throw new Error("OpenAI API key is not set");
      }
      return testOpenAIConnection(apiKeys.openai);

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
