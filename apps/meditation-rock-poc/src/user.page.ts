import { html, render } from "lit-html";
import { map, mergeWith, of, Subject, tap, withLatestFrom } from "rxjs";
import { ConnectionsComponent } from "./connections/connections.component";
import { db, fetchRockConfig, uploadSession } from "./database/database";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";
import { useMeditationSession } from "./session/use-meditation-session";
import "./user.page.css";

const urlParams = new URLSearchParams(location.search);
const roundId = urlParams.get("round");
const rockId = urlParams.get("rock");

if (!roundId || !rockId) {
  throw new Error("Round ID and Rock ID must be specified in URL parameters (e.g., ?round=xxx&rock=yyy)");
}

const UserPage = createComponent(() => {
  const { status$, isTalking$, orderedTranscripts$, memories$, startConnection$, stopConnection$, effects$ } =
    useMeditationSession({
      fetchConfig: () => fetchRockConfig(rockId!),
    });

  const start = () => startConnection$.next();
  const stop = () => stopConnection$.next();

  const talkStart = () => isTalking$.next(true);
  const talkStop = () => isTalking$.next(false);

  const connectButtonLabel$ = status$.pipe(
    map((state) => {
      if (state === "idle") return "Start Meditation";
      if (state === "connecting") return "Connecting...";
      if (state === "connected") return "End Meditation";
      return "Start Meditation";
    })
  );

  const talkButtonLabel$ = isTalking$.pipe(map((talking) => (talking ? "Release to Send" : "Hold to Talk")));

  const hasMemories$ = memories$.pipe(map((memories) => memories.length > 0));

  const submitClick$ = new Subject<void>();

  const handleSubmit = () => {
    submitClick$.next();
  };

  // Handle submit logic
  const submitEffect$ = submitClick$.pipe(
    withLatestFrom(memories$, status$),
    tap(async ([_, memories, status]) => {
      if (memories.length === 0) return;

      try {
        await uploadSession(db, roundId!, rockId!, memories);
        alert("Meditation session submitted successfully! Thank you for sharing your experience.");

        // Disconnect after successful submit
        if (status === "connected") {
          stopConnection$.next();
        }
      } catch (error) {
        console.error("Error submitting session:", error);
        alert("Failed to submit session. Please try again.");
      }
    }),
    map(() => template)
  );

  const template = html`
    <header class="app-header">
      <h1>🧘 Meditation Session</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
    </header>
    <main>
      <div class="session-info">
        <p><strong>Round:</strong> ${roundId}</p>
        <p><strong>Rock:</strong> ${rockId}</p>
      </div>

      <div class="meditation-status">
        <h2>
          ${observe(
            status$.pipe(
              map((s) => {
                if (s === "idle") return "🪨 Ready to Meditate";
                if (s === "connecting") return "🔄 Connecting...";
                if (s === "connected") return "🧘 Meditation in Progress";
                return "🪨 Ready to Meditate";
              })
            )
          )}
        </h2>
        <p>
          ${observe(
            status$.pipe(
              map((s) => {
                if (s === "idle") return "Click 'Start Meditation' to begin your session";
                if (s === "connecting") return "Preparing your meditation space...";
                if (s === "connected") return "Hold the Talk button to speak with your guru rock";
                return "Click 'Start Meditation' to begin your session";
              })
            )
          )}
        </p>
      </div>

      <section class="controls">
        <button
          class=${observe(status$.pipe(map((s) => (s === "connected" ? "stop-button" : "start-button"))))}
          @click=${() => (status$.value === "idle" ? start() : stop())}
          ?disabled=${observe(status$.pipe(map((s) => s === "connecting")))}
        >
          ${observe(connectButtonLabel$)}
        </button>
        <button
          class="talk-button"
          @mousedown=${talkStart}
          @mouseup=${talkStop}
          @mouseleave=${talkStop}
          @touchstart=${talkStart}
          @touchend=${talkStop}
          ?disabled=${observe(status$.pipe(map((s) => s !== "connected")))}
        >
          ${observe(talkButtonLabel$)}
        </button>
        <button
          class="submit-button"
          @click=${handleSubmit}
          ?disabled=${observe(hasMemories$.pipe(map((has) => !has)))}
        >
          Submit Session
        </button>
      </section>

      <section class="memories-section">
        <h2>✨ Session Memories</h2>
        ${observe(
          memories$.pipe(
            map((memories) =>
              memories.length > 0
                ? html`
                    <ul class="memories-list">
                      ${memories.map((memory) => html`<li>${memory}</li>`)}
                    </ul>
                  `
                : html`<p>Memories will appear here as your meditation progresses...</p>`
            )
          )
        )}
      </section>

      <details class="transcript-section">
        <summary>Conversation Transcript</summary>
        ${observe(
          orderedTranscripts$.pipe(
            map(
              (transcript) =>
                html`<div class="transcript">
                  ${transcript.map(
                    (entry) =>
                      html`<div class="transcript-entry"><strong>${entry.role}:</strong> ${entry.content}</div>`
                  )}
                </div>`
            )
          )
        )}
      </details>
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

  return of(template).pipe(mergeWith(effects$, submitEffect$));
});

render(UserPage(), document.getElementById("app")!);
