import { tool } from "@openai/agents";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { html } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { BehaviorSubject, catchError, EMPTY, ignoreElements, map, merge, mergeWith, of, Subject, switchMap, tap } from "rxjs";
import { z } from "zod";
import { apiKeys$ } from "../connections/connections.component";
import { getEphermeralToken$ } from "../openai/token";
import { createComponent } from "../sdk/create-component";
import { observe } from "../sdk/observe-directive";

export interface Rock {
  rockName: string;
  rockVoice: string;
  userName: string | null;
  memories: string[];
}

export const rocks$ = new BehaviorSubject<Rock[]>([
  { rockName: "Boulder", rockVoice: "alloy", userName: "Cassie", memories: [] },
  { rockName: "Pebble", rockVoice: "shimmer", userName: "Awu", memories: [] },
  { rockName: "Stone", rockVoice: "fable", userName: null, memories: [] },
  { rockName: "Granite", rockVoice: "ash", userName: null, memories: [] },
]);

const connectTool = tool({
  name: "connect",
  description: "Connect a human with a rock",
  parameters: z.object({
    humanName: z.string(),
    rockName: z.string(),
  }),
  execute: async ({ humanName, rockName }: { humanName: string; rockName: string }) => {
    const rocks = rocks$.value;
    const rockIndex = rocks.findIndex((r) => r.rockName === rockName);
    if (rockIndex !== -1 && rocks[rockIndex].userName === null) {
      rocks[rockIndex].userName = humanName;
      rocks$.next(rocks);
      return `Connected human ${humanName} with rock ${rockName}`;
    } else {
      return `Rock ${rockName} is not available for adoption. Please choose another rock.`;
    }
  },
});

export const RockAdoption = createComponent(() => {
  const agent = new RealtimeAgent({
    name: "Rock Garden",
    instructions: `
You are a Rock Garden. You role is to help human connect with rocks. The human will read the following statement:
"My name is __, I agree to adopt __ as my rock buddy and treat it with care and respect."

And your role is to identify user's name and the rock name from the statement to make a connection.

If you reads the statement correctly, use the connect(humanName: string, rockName: string) tool then confirm to the user in this format:
"Thank you, [humanName]. You are now connected with [rockName]. Please take good care of [rockName] and see you soon!"

If user makes a mistake in the statement, politely nudge them to read the statement again correctly.
`.trim(),
    voice: "sage",
    tools: [connectTool],
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
        voice: "sage",
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
      if (state === "idle") return "Adopt a rock";
      if (state === "connecting") return "Connecting...";
      if (state === "connected") return "Connected";
      return "Start";
    })
  );

  const AvailableRocks$ = rocks$.pipe(
    map((rocks) =>
      repeat(
        rocks.filter((rock) => rock.userName === null),
        (rock) => rock.rockName,
        (rock) => html`<option value="${rock.rockName}">${rock.rockName}</option>`
      )
    )
  );

  const template = html`
    <div>
      <b>Available rocks</b>
      ${observe(AvailableRocks$)}
    </div>
    <button @click=${() => (status$.value === "idle" ? start() : stop())}>${observe(buttonLabel$)}</button>
    <p>
      <b>Read the following statement to bind with a rock.</b><br />
      <em>My name is __, I agree to adopt __ as my rock buddy and treat it with care and respect.</em>
    </p>
  `;

  return of(template).pipe(mergeWith(effects$));
});
