import { JSONParser } from "@streamparser/json";
import { OpenAI } from "openai";
import { Observable } from "rxjs";
import type { DbRound } from "../database/database";

export interface Theme {
  theme: string;
  description: string;
}

export function generateThemes(round: DbRound, apiKey: string, existingThemes?: string[]): Observable<Theme> {
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
        // 1 - format each device's transcript into a single string (device summary)
        const deviceSummaries = (round.devices || [])
          .map((device, deviceIndex) => {
            let transcript = "";
            if (device.sessions && Array.isArray(device.sessions)) {
              transcript = device.sessions
                .flatMap((session) => session.transcripts || [])
                .map((msg: any) => `${msg.role}: ${msg.content}`)
                .join("\n");
            }
            return `Device ${deviceIndex + 1} (${device.name}):\n${transcript}`;
          })
          .join("\n\n---\n\n");

        // 2 - prompt AI with all the device summaries to identify common themes
        const existingThemesSection =
          existingThemes && existingThemes.length > 0
            ? `\nAlready identified themes (DO NOT suggest these again):\n${existingThemes.map((t) => `- ${t}`).join("\n")}\n`
            : "";

        const prompt = `
Analyze the following transcriptions from multiple devices and identify common themes that emerge across the discussions.

${deviceSummaries}
${existingThemesSection}
Extract up to 5 common themes that appear across these transcriptions. Each theme should represent a pattern, topic, or concept that multiple participants discussed or implied. Generate NEW themes that are different from any already identified themes.

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

        // 3 - use streaming json parser to emit the themes as soon as the text arrives
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
