import { html, render } from "lit-html";
import { BehaviorSubject, combineLatest, map, mergeWith, of, Subject, tap, withLatestFrom } from "rxjs";
import { apiKeys$, ConnectionsComponent } from "./connections/connections.component";
import { db, fetchRockConfig, uploadSession } from "./database/database";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";
import { anonymizeTranscript } from "./session/anonymize-transcript";
import { useMeditationSession } from "./session/use-meditation-session";
import "./user.page.css";

const urlParams = new URLSearchParams(location.search);
const roundId = urlParams.get("round");
const rockId = urlParams.get("rock");

if (!roundId || !rockId) {
  throw new Error("Round ID and Rock ID must be specified in URL parameters (e.g., ?round=xxx&rock=yyy)");
}

const UserPage = createComponent(() => {
  const { status$, orderedTranscripts$, startConnection$, stopConnection$, effects$ } = useMeditationSession({
    fetchConfig: () => fetchRockConfig(rockId!),
  });

  const memories$ = new BehaviorSubject<string[]>([]);
  const isAnonymizing$ = new BehaviorSubject<boolean>(false);

  const start = () => startConnection$.next();
  const stop = () => stopConnection$.next();

  const connectButtonLabel$ = status$.pipe(
    map((state) => {
      if (state === "idle") return "Start";
      if (state === "connecting") return "Connecting...";
      if (state === "connected") return "End";
      return "Start";
    })
  );

  const hasTranscript$ = orderedTranscripts$.pipe(map((t) => t.length > 0));
  const hasMemories$ = memories$.pipe(map((memories) => memories.length > 0));
  
  // Combined observable for disable state of Anonymize button
  const anonymizeDisabled$ = combineLatest([isAnonymizing$, hasTranscript$]).pipe(
    map(([isAnonymizing, hasTranscript]) => isAnonymizing || !hasTranscript)
  );

  const anonymizeClick$ = new Subject<void>();
  const submitClick$ = new Subject<void>();

  // Handle anonymize logic - prevent multiple simultaneous calls
  const anonymizeEffect$ = anonymizeClick$.pipe(
    withLatestFrom(orderedTranscripts$, isAnonymizing$),
    tap(async ([_, transcript, isAlreadyAnonymizing]) => {
      // Prevent concurrent anonymization calls
      if (isAlreadyAnonymizing || transcript.length === 0) return;

      const apiKey = apiKeys$.value.openai;
      if (!apiKey) {
        alert("Please configure your OpenAI API key in Setup first.");
        return;
      }

      isAnonymizing$.next(true);
      try {
        const anonymizedMemories = await anonymizeTranscript(transcript, apiKey);
        memories$.next(anonymizedMemories);
      } catch (error) {
        console.error("Error anonymizing transcript:", error);
        alert("Failed to anonymize transcript. Please try again.");
      } finally {
        isAnonymizing$.next(false);
      }
    }),
    map(() => template)
  );

  // Handle submit logic
  const submitEffect$ = submitClick$.pipe(
    withLatestFrom(memories$),
    tap(async ([_, memories]) => {
      if (memories.length === 0) return;

      try {
        await uploadSession(db, roundId!, rockId!, memories);
        alert("Session submitted. Thank you.");
        memories$.next([]);
      } catch (error) {
        console.error("Error submitting session:", error);
        alert("Failed to submit session. Please try again.");
      }
    }),
    map(() => template)
  );

  const template = html`
    <header>
      <span>Meditation Session</span>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
    </header>

    <main>
      <section class="session-controls">
        <div class="status">
          ${observe(
            status$.pipe(
              map((s) => {
                if (s === "idle") return "Ready";
                if (s === "connecting") return "Connecting...";
                if (s === "connected") return "In session (speak freely)";
                return "Ready";
              })
            )
          )}
        </div>
        <div class="buttons">
          <button
            @click=${() => (status$.value === "idle" ? start() : stop())}
            ?disabled=${observe(status$.pipe(map((s) => s === "connecting")))}
          >
            ${observe(connectButtonLabel$)}
          </button>
        </div>
      </section>

      <section class="transcript-section">
        <label>Transcript</label>
        <div class="transcript">
          ${observe(
            orderedTranscripts$.pipe(
              map((transcript) =>
                transcript.length > 0
                  ? transcript.map(
                      (entry) => html`<div class="entry"><b>${entry.role}:</b> ${entry.content}</div>`
                    )
                  : html`<div class="placeholder">Transcript will appear here...</div>`
              )
            )
          )}
        </div>
      </section>

      <section class="memory-section">
        <label>Anonymized Memory</label>
        <div class="memory">
          ${observe(
            memories$.pipe(
              map((memories) =>
                memories.length > 0
                  ? html`<ul>
                      ${memories.map((m) => html`<li>${m}</li>`)}
                    </ul>`
                  : html`<div class="placeholder">
                      Click "Anonymize" after ending session to generate memory.
                    </div>`
              )
            )
          )}
        </div>
        <div class="buttons">
          <button @click=${() => anonymizeClick$.next()} ?disabled=${observe(anonymizeDisabled$)}>
            ${observe(isAnonymizing$.pipe(map((a) => (a ? "Anonymizing..." : "Anonymize"))))}
          </button>
          <button @click=${() => submitClick$.next()} ?disabled=${observe(hasMemories$.pipe(map((has) => !has)))}>
            Submit
          </button>
        </div>
      </section>
    </main>

    <dialog id="connection-dialog">
      <div class="dialog-body">
        ${ConnectionsComponent()}
        <form method="dialog">
          <button>Close</button>
        </form>
      </div>
    </dialog>
  `;

  return of(template).pipe(mergeWith(effects$, anonymizeEffect$, submitEffect$));
});

render(UserPage(), document.getElementById("app")!);
