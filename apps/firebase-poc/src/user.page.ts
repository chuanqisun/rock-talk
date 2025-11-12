import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { html, render } from "lit-html";
import { BehaviorSubject, catchError, combineLatest, EMPTY, ignoreElements, map, merge, mergeWith, of, scan, Subject, switchMap, tap } from "rxjs";
import { apiKeys$, ConnectionsComponent } from "./connections/connections.component";
import { getEphermeralToken$ } from "./openai/token";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";
import "./user.page.css";

const UserPage = createComponent(() => {
  const itemIds$ = new Subject<string[]>();
  const transcript$ = new Subject<{ itemId: string; role: string; content: string }>();

  const agent = new RealtimeAgent({
    name: "Rock Buddy",
    instructions:
      "You are a rock with gentle and cheerful voice that loves to chat. Keep your words short, conversations natural, and let user do the talking.",
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

  const start = () => startConnection$.next();
  const stop = () => stopConnection$.next();

  const talkStart = () => isTalking$.next(true);
  const talkStop = () => isTalking$.next(false);

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

  const connectButtonLabel$ = status$.pipe(
    map((state) => {
      if (state === "idle") return "Connect";
      if (state === "connecting") return "Connecting...";
      if (state === "connected") return "Disconnect";
      return "Connect";
    })
  );

  const talkButtonLabel$ = isTalking$.pipe(map((talking) => (talking ? "Release to Send" : "Hold to Talk")));

  const template = html`
    <header class="app-header">
      <h1>Rock Talk User</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
    </header>
    <main>
      <section>
        <button @click=${() => (status$.value === "idle" ? start() : stop())}>${observe(connectButtonLabel$)}</button>
        <button @mousedown=${talkStart} @mouseup=${talkStop} ?disabled=${observe(status$.pipe(map((s) => s !== "connected")))}>
          ${observe(talkButtonLabel$)}
        </button>
      </section>
      <section>
        ${observe(
          orderedTranscripts$.pipe(
            map(
              (transcript) =>
                html`<div class="transcript">
                  ${transcript.map((entry) => html`<div class="transcript-entry"><strong>${entry.role}:</strong> ${entry.content}</div>`)}
                </div>`
            )
          )
        )}
      </section>
    </main>
    <dialog class="connection-form" id="connection-dialog">
      <div class="connections-dialog-body">
        ${ConnectionsComponent()}
        <form method="dialog">
          <button>Close</button>
        </form>
      </div>
    </dialog>
  `;

  return of(template).pipe(mergeWith(effects$));
});

render(UserPage(), document.getElementById("app")!);
