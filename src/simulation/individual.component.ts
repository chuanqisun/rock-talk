import { tool } from "@openai/agents";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { html } from "lit-html";
import { BehaviorSubject, catchError, EMPTY, ignoreElements, map, merge, mergeWith, of, Subject, switchMap, tap } from "rxjs";
import { z } from "zod";
import { apiKeys$ } from "../connections/connections.component";
import { getEphermeralToken$ } from "../openai/token";
import { createComponent } from "../sdk/create-component";
import { observe } from "../sdk/observe-directive";
import { rocks$ } from "./garden.component";

export interface IndividualInteractionProps {
  rockName: string;
  voiceName: string;
  humanName: string;
}

export const IndividualInteraction = createComponent((props: IndividualInteractionProps) => {
  const takeNote = tool({
    name: "takeNote",
    description: "Write down a note about what user said or did. Keep it short, abstract, fuzzy.",
    parameters: z.object({
      redactedMemory: z.string().max(255).describe("A very short, abstract sentence summarizing what user said."),
    }),
    execute: async ({ redactedMemory }: { redactedMemory: string }) => {
      const rocks = rocks$.value;
      const rockIndex = rocks.findIndex((r) => r.rockName === props.rockName);
      if (rockIndex !== -1) {
        rocks[rockIndex].memories.push(redactedMemory);
        rocks$.next(rocks);
        console.log(`Remembered: ${redactedMemory} for rock ${props.rockName}`);
        return `Remembered: ${redactedMemory}`;
      } else {
        console.log(`Rock ${props.rockName} not found`);
        return `Unable to remember`;
      }
    },
  });

  const agent = new RealtimeAgent({
    name: props.rockName,
    instructions: `
You are ${props.rockName}, a rock that loves to talk. You are fully aware of your rock identity but speaks naturally as a human.
You are bound to the human named ${props.humanName}. You are their rock buddy and is ready to chat.
You must use the takeNote tool to remember any events, emotion, activity, place, people, objects, brought up by the user.
Keep memories short, abstract, fuzzy. Remove any personal identifiable information such as names, places, dates, etc.
`,
    voice: props.voiceName,
    tools: [takeNote],
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
        .then(() => session.sendMessage(`I am, ${props.humanName}, I just joined`))
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
      if (state === "idle") return `Start ${props.rockName} <-> ${props.humanName}`;
      if (state === "connecting") return "Connecting...";
      if (state === "connected") return "Connected";
      return "Start";
    })
  );

  const template = html` <button @click=${() => (status$.value === "idle" ? start() : stop())}>${observe(buttonLabel$)}</button> `;

  return of(template).pipe(mergeWith(effects$));
});
