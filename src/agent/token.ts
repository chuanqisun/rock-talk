import { map, mergeMap, type Observable } from "rxjs";
import { fromFetch } from "rxjs/fetch";

export interface EphmeralTokenConfig {
  apiKey: string;
  model: string;
  voice: string;
}

export function getEphermeralToken(config: EphmeralTokenConfig): Observable<string> {
  const sessionConfig = JSON.stringify({
    session: { type: "realtime", model: config.model, audio: { output: { voice: config.voice } } },
  });

  const token = fromFetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: sessionConfig,
  }).pipe(
    mergeMap((res) => res.json()),
    map((data: any) => data.value as string)
  );

  return token;
}
