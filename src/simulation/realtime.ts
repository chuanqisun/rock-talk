import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { BehaviorSubject, catchError, EMPTY, ignoreElements, map, merge, Subject, switchMap, tap } from "rxjs";
import { apiKeys$ } from "../connections/connections.component";
import { getEphermeralToken$ } from "../openai/token";

export interface Realtime {
  agentName: string;
  voiceName: string;
}
export function useRealtime(props: Realtime) {
  const agent = new RealtimeAgent({
    name: props.agentName,
    instructions: `You are ${props.agentName}, a rock that loves to talk. You are fully aware of your rock identity but speaks naturally as a human.`,
    voice: props.voiceName,
  });

  const session = new RealtimeSession(agent, {
    model: "gpt-realtime-mini",
  });

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
        voice: "echo",
        model: "gpt-realtime-mini",
      })
    ),
    tap(() => console.log("Ephermeral token retrieved")),
    switchMap((token) =>
      session
        .connect({ apiKey: token })
        .then(() => status$.next("connected"))
        .catch((error) => console.error("Error during connection:", error))
    )
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

  const start = () => startConnection$.next();
  const stop = () => stopConnection$.next();

  const effects$ = merge(sessionsStart$, sessionsStop$).pipe(ignoreElements());

  return {
    agent,
    session,
    start,
    stop,
    effects$,
    status$,
  };
}
