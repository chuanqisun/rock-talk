import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { BehaviorSubject, catchError, combineLatest, EMPTY, ignoreElements, map, merge, scan, Subject, switchMap, tap } from "rxjs";
import { apiKeys$ } from "../connections/connections.component";
import { getEphermeralToken$ } from "../openai/token";

export interface Config {
  instructions: string;
}
export interface RockSessionProps {
  fetchConfig: () => Promise<string>;
}
export function useRockSession(props: RockSessionProps) {
  const itemIds$ = new Subject<string[]>();
  const transcript$ = new Subject<{ itemId: string; role: string; content: string }>();

  const agent = new RealtimeAgent({
    name: "Rock Buddy",
    instructions:
      "You are a talking rock but due to a system error, you have not been initialized to interact with the user yet. Decline all interactions and ask user to check with the Rock Talk project admin.",
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

  // (session as any).on("transport_event", (data: any) => {
  //   console.log("Transcription completed:", data);
  // });

  const startConnection$ = new Subject<void>();
  const stopConnection$ = new Subject<void>();
  const status$ = new BehaviorSubject<"idle" | "connecting" | "connected">("idle");
  const isTalking$ = new BehaviorSubject<boolean>(false);

  const sessionsStart$ = startConnection$.pipe(
    tap(() => status$.next("connecting")),
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
        // Assuming session has a mute method; adjust if not
        if (typeof (session as any).mute === "function") (session as any).mute(!talking);
        if (talking) {
          session.interrupt();
        }
      })
    )
  ).pipe(ignoreElements());

  return {
    orderedTranscripts$,
    status$,
    isTalking$,
    effects$,
    startConnection$,
    stopConnection$,
  };
}
