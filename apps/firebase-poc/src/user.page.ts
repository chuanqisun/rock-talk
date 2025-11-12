import { html, render } from "lit-html";
import { map, mergeWith, of } from "rxjs";
import { ConnectionsComponent } from "./connections/connections.component";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";
import { useRockSession } from "./session/use-rock-session";
import "./user.page.css";

const UserPage = createComponent(() => {
  const { status$, isTalking$, orderedTranscripts$, startConnection$, stopConnection$, effects$ } = useRockSession();

  const start = () => startConnection$.next();
  const stop = () => stopConnection$.next();

  const talkStart = () => isTalking$.next(true);
  const talkStop = () => isTalking$.next(false);

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
