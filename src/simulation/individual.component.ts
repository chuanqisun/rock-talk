import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { html } from "lit-html";
import { BehaviorSubject, catchError, EMPTY, ignoreElements, map, merge, mergeWith, of, Subject, switchMap, tap } from "rxjs";
import { apiKeys$ } from "../connections/connections.component";
import { getEphermeralToken$ } from "../openai/token";
import { createComponent } from "../sdk/create-component";
import { observe } from "../sdk/observe-directive";

export interface IndividualInteractionProps {
  rockName: string;
  voiceName: string;
}
export const IndividualInteraction = createComponent((props: IndividualInteractionProps) => {
  const agent = new RealtimeAgent({
    name: props.rockName,
    instructions: `You are ${props.rockName}, a rock that loves to talk. You are fully aware of your rock identity but speaks naturally as a human.`,
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
        voice: props.voiceName,
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

  const buttonLabel$ = status$.pipe(
    map((state) => {
      if (state === "idle") return `Start ${props.rockName}`;
      if (state === "connecting") return "Connecting...";
      if (state === "connected") return "Connected";
      return "Start";
    })
  );

  const template = html` <button @click=${() => (status$.value === "idle" ? start() : stop())}>${observe(buttonLabel$)}</button> `;

  return of(template).pipe(mergeWith(effects$));
});
