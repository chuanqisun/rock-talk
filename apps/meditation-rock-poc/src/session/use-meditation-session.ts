import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { BehaviorSubject, catchError, combineLatest, EMPTY, ignoreElements, map, merge, scan, Subject, switchMap, tap } from "rxjs";
import { apiKeys$ } from "../connections/connections.component";
import { getEphermeralToken$ } from "../openai/token";
import { z } from "zod";

export interface MeditationSessionProps {
  fetchConfig: () => Promise<string>;
}

export function useMeditationSession(props: MeditationSessionProps) {
  const itemIds$ = new Subject<string[]>();
  const transcript$ = new Subject<{ itemId: string; role: string; content: string }>();
  const memories$ = new BehaviorSubject<string[]>([]);

  // Define the memory tool that the agent will use to record meditation insights
  const rememberMeditationTool = tool({
    name: "remember_meditation",
    description: "Record a meaningful insight, emotion, or breakthrough from the meditation session. Memories should be PII-redacted and focus on general themes rather than specific personal details.",
    parameters: z.object({
      memory: z.string().describe("A PII-redacted memory or insight from the meditation session"),
    }),
    execute: async ({ memory }) => {
      const currentMemories = memories$.value;
      memories$.next([...currentMemories, memory]);
      return `Memory recorded: "${memory}"`;
    },
  });

  const agent = new RealtimeAgent({
    name: "Guru Rock",
    instructions:
      "You are a meditation guide with the personality of a rock and the wisdom of a guru. Due to a system error, you have not been initialized yet. Please ask the user to check with the administrator.",
    tools: [rememberMeditationTool],
  });

  const session = new RealtimeSession(agent, {
    model: "gpt-realtime-mini",
    config: {
      outputModalities: ["text", "audio"],
      audio: {
        input: {
          transcription: {
            model: "gpt-4o-mini-transcribe",
          },
        },
        output: {
          voice: "coral",
        },
      },
    },
  });

  async function updateInstruction(newInstruction: string) {
    session.transport.updateSessionConfig({
      instructions: newInstruction,
    });
  }

  session.on("transport_event", (e) => {
    if (e.type === "conversation.item.input_audio_transcription.completed") {
      transcript$.next({ itemId: e.item_id, role: "user", content: e.transcript });
    }
    if (e.type === "response.output_audio_transcript.done") {
      transcript$.next({ itemId: e.item_id, role: "model", content: e.transcript });
    }
  });

  // ids update is guaranteed to happen after transcript events
  session.on("history_updated", (history) => {
    const ids = history.filter((entry) => entry.type === "message").map((message) => message.itemId);
    itemIds$.next(ids);
  });

  const transcripts$ = transcript$.pipe(scan((acc, curr) => [...acc, curr], [] as { itemId: string; role: string; content: string }[]));

  const orderedTranscripts$ = combineLatest([itemIds$, transcripts$]).pipe(
    map(([ids, transcripts]) => {
      return ids.map((id) => transcripts.find((t) => t.itemId === id)).filter((item) => !!item);
    }),
    tap((ordered) => console.log("ordered transcripts:", ordered))
  );

  const startConnection$ = new Subject<void>();
  const stopConnection$ = new Subject<void>();
  const status$ = new BehaviorSubject<"idle" | "connecting" | "connected">("idle");
  const isTalking$ = new BehaviorSubject<boolean>(false);

  const sessionsStart$ = startConnection$.pipe(
    tap(() => {
      status$.next("connecting");
      // Reset memories when starting a new session
      memories$.next([]);
    }),
    switchMap(() =>
      getEphermeralToken$({
        apiKey: apiKeys$.value.openai!,
        voice: "coral",
        model: "gpt-realtime-mini",
      })
    ),
    switchMap(async (token) => {
      await session
        .connect({ apiKey: token })
        .then(() => status$.next("connected"))
        .catch((error) => console.error("Error during connection:", error));

      // there appears to be bug that requires manually updating the config to enable input transcription
      await session.transport.updateSessionConfig({
        audio: {
          input: {
            transcription: {
              model: "gpt-4o-mini-transcribe",
            },
          },
        },
      });

      await session.mute(true);

      // Fetch and update instructions
      try {
        const instructions = await props.fetchConfig();
        console.log("Fetched instructions:", instructions);
        await updateInstruction(instructions);
      } catch (error) {
        console.error("Error fetching config:", error);
      }
    })
  );

  const sessionsStop$ = stopConnection$.pipe(
    map(() => {
      session.close();
      status$.next("idle");
    }),
    catchError((error) => {
      console.error("Error during disconnection:", error);
      return EMPTY;
    })
  );

  const effects$ = merge(
    sessionsStart$,
    sessionsStop$,
    isTalking$.pipe(
      tap((talking) => {
        if (typeof (session as unknown as { mute: (muted: boolean) => void }).mute === "function") {
          (session as unknown as { mute: (muted: boolean) => void }).mute(!talking);
        }
        if (talking) {
          session.interrupt();
        }
      })
    )
  ).pipe(ignoreElements());

  return {
    orderedTranscripts$,
    memories$,
    status$,
    isTalking$,
    effects$,
    startConnection$,
    stopConnection$,
  };
}
