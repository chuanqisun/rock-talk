import { JSONParser } from "@streamparser/json";
import { OpenAI } from "openai";
import { Observable } from "rxjs";
import type { DbRoundWithId } from "../database/database";

export interface Theme {
  theme: string;
  description: string;
}

export function generateThemes(round: DbRoundWithId, apiKey: string, existingThemes?: string[]): Observable<Theme> {
  return new Observable<Theme>((subscriber) => {
    const abortController = new AbortController();

    const openai = new OpenAI({
      dangerouslyAllowBrowser: true,
      apiKey: apiKey,
    });

    const parser = new JSONParser();

    // Wire up parser event to emit themes
    parser.onValue = (entry) => {
      // Check if this is an array item under the "themes" key
      if (typeof entry.key === "number" && entry.parent && entry.value && typeof entry.value === "object") {
        const theme = entry.value as unknown as Theme;
        if (theme.theme && theme.description) {
          subscriber.next(theme);
        }
      }
    };

    // Call OpenAI responses API in structured mode, streaming output
    (async () => {
      try {
        // Format all session memories for analysis
        const sessionSummaries = (round.sessions || [])
          .map((session, sessionIndex) => {
            const memories = session.memory?.join("\n- ") || "No memories recorded";
            return `Session ${sessionIndex + 1} (${new Date(session.createdAt).toLocaleString()}):\n- ${memories}`;
          })
          .join("\n\n---\n\n");

        const existingThemesSection =
          existingThemes && existingThemes.length > 0
            ? `\nAlready identified themes (DO NOT suggest these again):\n${existingThemes.map((t) => `- ${t}`).join("\n")}\n`
            : "";

        const prompt = `
Analyze the following meditation session memories and identify common themes that emerge across the sessions.

Round topic: ${round.topic}

${sessionSummaries}
${existingThemesSection}
Extract up to 5 common themes that appear across these meditation sessions, keeping in mind the meditation topic of "${round.topic}". Each theme should represent a pattern, insight, emotion, or concept that multiple participants experienced or explored. Generate NEW themes that are different from any already identified themes.

Respond in this JSON format:
{
  "themes": [
    {
      "theme": "string",
      "description": "string"
    }
  ]
}
        `.trim();

        const responseStream = await openai.responses.create(
          {
            model: "gpt-5-mini",
            input: prompt,
            text: { format: { type: "json_object" }, verbosity: "low" },
            reasoning: { effort: "minimal" },
            stream: true,
          },
          {
            signal: abortController.signal,
          }
        );

        // Use streaming json parser to emit themes as soon as the text arrives
        for await (const chunk of responseStream) {
          if (chunk.type === "response.output_text.delta") {
            parser.write(chunk.delta);
          }
        }
        subscriber.complete();
      } catch (error) {
        subscriber.error(error);
      }
    })();

    return () => {
      abortController.abort();
    };
  });
}
