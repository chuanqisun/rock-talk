import { OpenAI } from "openai";

export interface TranscriptEntry {
  role: string;
  content: string;
}

export async function anonymizeTranscript(
  transcript: TranscriptEntry[],
  apiKey: string
): Promise<string[]> {
  const openai = new OpenAI({
    dangerouslyAllowBrowser: true,
    apiKey: apiKey,
  });

  const transcriptText = transcript
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join("\n");

  const prompt = `
Analyze the following meditation session transcript and generate a list of anonymized memory entries.

Each memory should:
1. Focus on specific things the user mentioned during the meditation
2. NOT include any information that could reveal the user's identity (names, locations, specific dates, relationships, workplace, etc.)
3. Capture insights, emotions, themes, and breakthroughs
4. Be concise but meaningful

Generate 3-7 memory entries based on the content of the session.

Transcript:
${transcriptText}

Respond with a JSON object in this format:
{
  "memories": ["memory 1", "memory 2", "memory 3"]
}
`.trim();

  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    text: { format: { type: "json_object" } },
  });

  const output = response.output.find((item) => item.type === "message");
  if (!output || output.type !== "message") {
    throw new Error("No message output from anonymization");
  }

  const textContent = output.content.find((c) => c.type === "output_text");
  if (!textContent || textContent.type !== "output_text") {
    throw new Error("No text content from anonymization");
  }

  const parsed = JSON.parse(textContent.text) as { memories: string[] };
  return parsed.memories;
}
