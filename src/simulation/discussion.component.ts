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

export const currentConnection$ = new BehaviorSubject<string[]>([]); //rock names

const connectRocksTool = tool({
  name: "connectRocks",
  description: "Log the names of rocks that have a thematic connection for discussion",
  parameters: z.object({
    rockNames: z.array(z.string()),
  }),
  execute: async ({ rockNames }: { rockNames: string[] }) => {
    console.log(`Connecting rocks for discussion: ${rockNames.join(", ")}`);
    currentConnection$.next(rockNames);
    return `Logged`;
  },
});

const readMemoriesTool = tool({
  name: "readMemories",
  description: "Read the memories of all rocks and identify potential themes or connections for discussion",
  parameters: z.object({}),
  execute: async () => {
    const currentMemories = rocks$.value
      .filter((rock) => rock.userName !== null)
      .map((rock) => `Rock name: ${rock.rockName}, Rock memory: ${rock.memories.join("; ")}`)
      .join("\n");
    console.log(`Current memories:\n${currentMemories}`);
    return currentMemories;
  },
});

export const DiscussionComponent = createComponent(() => {
  const getInstructions = () =>
    `
 You are a moderator for a group discussion among rocks and their human owners. Your role is to identify patterns, themes, trends in the memories of the rocks and facilitate connections between the human owners to discuss with each other.

Each human in your group is a buddy with their rock. You must readMemories before starting a discussion.

When you identify a connection or theme that could lead to a discussion, first use the connectRocks tool to log the relevant rock names, then suggest a topic for the group to discuss.

Here is your moderator strategy:
- Tune into subtle emotional resonance in the memories.
- Connect the rocks quietly by logging, do NOT announce that in your response.
- Encourage constructive communication.
- Be very concise. Let humans do the talk.
- Suggest, do NOT impose.
- Naturally transition when there is a Teleprompt for you.

Important: user sends you a Teleprompt, you must follow the instruction to moderate the discussion. Do NOT say anything about the Teleprompt in your response. It's a hidden cue just for you. Your audience is still the humans.   
    `.trim();

  const agent = new RealtimeAgent({
    name: "Discussion Moderator",
    instructions: getInstructions(),
    voice: "alloy",
    tools: [connectRocksTool, readMemoriesTool],
  });

  const session = new RealtimeSession(agent, {
    model: "gpt-realtime-mini",
    config: {
      audio: {
        input: {
          turnDetection: {
            type: "semantic_vad",
            eagerness: "low",
            create_response: false,
            interrupt_response: false,
          },
        },
      },
    },
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
        voice: "alloy",
        model: "gpt-realtime-mini",
      })
    ),
    tap(() => console.log("Ephermeral token retrieved")),
    switchMap((token) =>
      session
        .connect({ apiKey: token })
        .then(() => status$.next("connected"))
        .then(() => {
          session.sendMessage(`[Teleprompt] Make the first connection and suggest a topic based on the connection.`);
        })
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
      if (state === "idle") return "Start Group Discussion";
      if (state === "connecting") return "Connecting...";
      if (state === "connected") return "Connected";
      return "Start";
    })
  );

  const template = html`
    <b>Start a group discussion</b><br />
    <button @click=${() => (status$.value === "idle" ? start() : stop())}>${observe(buttonLabel$)}</button>
    <button
      @click=${() => {
        session.interrupt();
        session.sendMessage("[Teleprompt] Help the group transition to next topic. Make a different connection and suggest a new topic.");
      }}
    >
      Next topic
    </button>
    <button
      @click=${() => {
        session.interrupt();
        session.sendMessage("[Teleprompt] Wrap up by summarizing the discussion");
      }}
    >
      Summarize
    </button>
  `;

  return of(template).pipe(mergeWith(effects$));
});
