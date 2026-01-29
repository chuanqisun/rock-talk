import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { BehaviorSubject, catchError, combineLatest, EMPTY, ignoreElements, map, merge, scan, startWith, Subject, switchMap, tap } from "rxjs";
import { apiKeys$ } from "../connections/connections.component";
import { getEphermeralToken$ } from "../openai/token";

export interface MeditationSessionProps {
  fetchConfig: () => Promise<string>;
}

export function useMeditationSession(props: MeditationSessionProps) {
  const itemIds$ = new Subject<string[]>();
  const transcript$ = new Subject<{ itemId: string; role: string; content: string }>();

  const agent = new RealtimeAgent({
    name: "Guru Rock",
    instructions:
      "You are a meditation guide with the personality of a rock and the wisdom of a guru. Due to a system error, you have not been initialized yet. Please ask the user to check with the administrator.",
  });

  const session = new RealtimeSession(agent, {
    model: "gpt-realtime",
    config: {
      outputModalities: ["text", "audio"],
      turnDetection: {
        type: "server_vad",
      },
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

  const transcripts$ = transcript$.pipe(
    scan((acc, curr) => [...acc, curr], [] as { itemId: string; role: string; content: string }[]),
    startWith([] as { itemId: string; role: string; content: string }[])
  );

  const orderedTranscripts$ = combineLatest([itemIds$.pipe(startWith([] as string[])), transcripts$]).pipe(
    map(([ids, transcripts]) => {
      return ids.map((id) => transcripts.find((t) => t.itemId === id)).filter((item) => !!item);
    }),
    tap((ordered) => console.log("ordered transcripts:", ordered))
  );

  const startConnection$ = new Subject<void>();
  const stopConnection$ = new Subject<void>();
  const status$ = new BehaviorSubject<"idle" | "connecting" | "connected">("idle");

  const sessionsStart$ = startConnection$.pipe(
    tap(() => {
      status$.next("connecting");
    }),
    switchMap(() =>
      getEphermeralToken$({
        apiKey: apiKeys$.value.openai!,
        voice: "coral",
        model: "gpt-realtime",
      })
    ),
    switchMap(async (token) => {
      await session
        .connect({ apiKey: token })
        .then(() => status$.next("connected"))
        .catch((error) => console.error("Error during connection:", error));

      // Update config to enable input transcription and VAD
      await session.transport.updateSessionConfig({
        turnDetection: {
          type: "server_vad",
        },
        audio: {
          input: {
            transcription: {
              model: "gpt-4o-mini-transcribe",
            },
          },
        },
      });

      // Fetch and update instructions
      try {
        const instructions = await props.fetchConfig();
        console.log("Fetched instructions:", instructions);
        await updateInstruction(instructions);
        await session.sendMessage("(Speak slowly and calmly. Welcome the user to the session by announcing the topic.)");
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

  const effects$ = merge(sessionsStart$, sessionsStop$).pipe(ignoreElements());

  return {
    orderedTranscripts$,
    status$,
    effects$,
    startConnection$,
    stopConnection$,
  };
}
