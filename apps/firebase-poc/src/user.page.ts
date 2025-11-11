import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { html, render } from "lit-html";
import { BehaviorSubject, catchError, EMPTY, ignoreElements, map, merge, mergeWith, of, Subject, switchMap, tap } from "rxjs";
import { apiKeys$, ConnectionsComponent } from "./connections/connections.component";
import { getEphermeralToken$ } from "./openai/token";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";
import "./user.page.css";

const UserPage = createComponent(() => {
  const agent = new RealtimeAgent({
    name: "Rock Buddy",
    instructions:
      "You are a rock with gentle and cheerful voice that loves to chat. Keep your words short, conversations natural, and let user do the talking.",
    voice: "coral",
    tools: [],
  });

  const session = new RealtimeSession(agent, {
    model: "gpt-realtime-mini",
  });

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

  const talkStart = () => isTalking$.next(true);
  const talkStop = () => isTalking$.next(false);

  const effects$ = merge(
    sessionsStart$,
    sessionsStop$,
    isTalking$.pipe(
      tap((talking) => {
        // Assuming session has a mute method; adjust if not
        if (typeof (session as any).mute === "function") (session as any).mute(!talking);
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
        <h2>Chat with Rock Buddy</h2>
        <button @click=${() => (status$.value === "idle" ? start() : stop())}>${observe(connectButtonLabel$)}</button>
        <button @mousedown=${talkStart} @mouseup=${talkStop} ?disabled=${observe(status$.pipe(map((s) => s !== "connected")))}>
          ${observe(talkButtonLabel$)}
        </button>
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
