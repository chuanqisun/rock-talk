import { html, render } from "lit-html";
import { map, mergeWith, of, Subject, tap, withLatestFrom } from "rxjs";
import { ConnectionsComponent } from "./connections/connections.component";
import type { DbSession } from "./database/database";
import { db, fetchDeviceConfig, uploadSession } from "./database/database";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";
import { useRockSession } from "./session/use-rock-session";
import "./user.page.css";

const urlParams = new URLSearchParams(location.search);
const roundId = urlParams.get("round");
const deviceIndex = urlParams.get("device");

if (!roundId || !deviceIndex) {
  throw new Error("Round ID and Device Index must be specified in URL parameters (e.g., ?round=0&device=0)");
}

const UserPage = createComponent(() => {
  const { status$, isTalking$, orderedTranscripts$, startConnection$, stopConnection$, effects$ } = useRockSession({
    fetchConfig: () => fetchDeviceConfig(roundId!, parseInt(deviceIndex!)),
  });

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

  const hasTranscripts$ = orderedTranscripts$.pipe(map((transcripts) => transcripts.length > 0));

  const shareClick$ = new Subject<void>();

  const handleShare = () => {
    shareClick$.next();
  };

  // Handle share logic with withLatestFrom
  const shareEffect$ = shareClick$.pipe(
    withLatestFrom(orderedTranscripts$, status$),
    tap(async ([_, transcripts, status]) => {
      if (transcripts.length === 0) return;

      const session: DbSession = {
        createdAt: new Date().toISOString(),
        transcripts: transcripts.map((t: { itemId: string; role: string; content: string }) => ({
          role: t.role as "user" | "model",
          content: t.content,
        })),
      };

      try {
        await uploadSession(db, roundId!, parseInt(deviceIndex!), session);
        alert("Session shared successfully!");

        // Disconnect after successful share
        if (status === "connected") {
          stopConnection$.next();
        }
      } catch (error) {
        console.error("Error sharing session:", error);
        alert("Failed to share session. Please try again.");
      }
    }),
    map(() => template)
  );

  const template = html`
    <header class="app-header">
      <h1>Rock Talk User - Round ${roundId}, Device ${deviceIndex}</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
    </header>
    <main>
      <section>
        <button @click=${() => (status$.value === "idle" ? start() : stop())}>${observe(connectButtonLabel$)}</button>
        <button @mousedown=${talkStart} @mouseup=${talkStop} ?disabled=${observe(status$.pipe(map((s) => s !== "connected")))}>
          ${observe(talkButtonLabel$)}
        </button>
        <button ?disabled=${true}>Anonymize</button>
        <button @click=${handleShare} ?disabled=${observe(hasTranscripts$.pipe(map((has) => !has)))}>Share</button>
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

  return of(template).pipe(mergeWith(effects$, shareEffect$));
});

render(UserPage(), document.getElementById("app")!);
