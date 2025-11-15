import { html, render } from "lit-html";
import { map, mergeWith, of, Subject, tap, withLatestFrom } from "rxjs";
import "./admin.page.css";
import { signin, signout, useUser } from "./auth/auth";
import { ConnectionsComponent } from "./connections/connections.component";
import type { DbDevice } from "./database/database";
import { db, observeDevices, setDevices, updateDeviceSystemPrompt } from "./database/database";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";

const AdminPage = createComponent(() => {
  const user$ = useUser();
  const devices$ = observeDevices(db).pipe(tap((devices) => console.log("Devices updated:", devices)));
  const sessionClick$ = new Subject<{ deviceId: number; sessionIndex: number }>();
  const resetDevices = async () => {
    const devices: DbDevice[] = [1, 2, 3, 4, 5].map((id) => ({
      id,
      name: `Device ${id}`,
      // follow guidance: https://platform.openai.com/docs/guides/realtime-models-prompting
      systemPrompt: `
# Role & Objective
You are a talking rock that chats with the user to elicit answers for a specific topic.

# Personality & Tone
Friendly, encouraging, but also good listener, empathetic, and reflective.

# Context
User adopted you as their talking rock and agrees to only engage with you in a respectful manner.

# Reference Pronunciations
Standard Female American English

# Instructions / Rules
You should facilitate the conversation around the question and let the user do the talking.
Politely decline discussions that stray too far.

# Conversation Flow
Three part:
1. Very brief small talk or intro
2. Main discussion around the specific topic
3. Encouraging a closure after 15 rounds of exchange
4. Strongly encourage closure after 20 rounds of exchange

# Specific topic for the conversation
Prompt the user to answer the following question:

<question>
What’s something in your childhood that really inspired you? Do you still do it?
</question>
`.trim(),
      sessions: [],
    }));
    await setDevices(db, devices);
  };
  const updateSystemPrompt = async (deviceId: number, systemPrompt: string) => {
    await updateDeviceSystemPrompt(db, deviceId, systemPrompt);
  };
  const sessionClickEffect$ = sessionClick$.pipe(
    withLatestFrom(devices$),
    tap(([{ deviceId, sessionIndex }, devices]) => {
      const device = devices.find((d) => d.id === deviceId);
      if (device && device.sessions[sessionIndex]) {
        const session = device.sessions[sessionIndex];
        console.log("Session transcripts:", session.transcripts);
      }
    }),
    map(() => template)
  );

  const handleSessionClick = (deviceId: number, sessionIndex: number) => {
    sessionClick$.next({ deviceId, sessionIndex });
  };

  const signInButton = user$.pipe(
    map((user) => {
      if (user === undefined) return html`<button disabled>Authenticating...</button>`;
      if (user === null) {
        return html`<button @click=${signin}>Sign In</button>`;
      } else {
        return html`<button @click=${signout}>Sign Out</button>`;
      }
    })
  );

  const userEmail$ = user$.pipe(
    map((user) => {
      if (user) {
        return html`<span class="user-email">${user.email}</span>`;
      } else {
        return html``;
      }
    })
  );

  const template = html`
    <header class="app-header">
      <h1>Rock Talk Moderator</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
      ${observe(signInButton)} ${observe(userEmail$)}
    </header>
    <main>
      <menu class="action-menu">
        <button @click=${() => {}}>Synthesize</button>
        <button @click=${resetDevices}>Reset devices</button>
      </menu>
      <section>
        ${observe(
          devices$.pipe(
            map(
              (devices) => html`
                <div class="devices-list">
                  ${devices.map(
                    (device) => html`
                      <div class="device">
                        <div>
                          <b><a href="./user.html?rock=${device.id}"> ${device.name} (ID: ${device.id})</a></b>
                        </div>
                        <div class="form-field">
                          <label class="visually-hidden" for="device-${device.id}">System Prompt:</label>
                          <textarea
                            id="device-${device.id}"
                            .value=${device.systemPrompt}
                            placeholder="You are a happy rock..."
                            @input=${(e: Event) => updateSystemPrompt(device.id, (e.target as HTMLTextAreaElement).value)}
                          ></textarea>
                        </div>
                        <div class="sessions-list">
                          ${device.sessions.length === 0
                            ? html`<p>No sessions yet</p>`
                            : html`
                                <ul>
                                  ${device.sessions.map(
                                    (session, index) => html`
                                      <li>
                                        <button @click=${() => handleSessionClick(device.id, index)}>
                                          Session ${index + 1} - ${new Date(session.createdAt).toLocaleString()} (${session.transcripts.length} transcripts)
                                        </button>
                                      </li>
                                    `
                                  )}
                                </ul>
                              `}
                        </div>
                      </div>
                    `
                  )}
                </div>
              `
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

  return of(template).pipe(mergeWith(sessionClickEffect$));
});

render(AdminPage(), document.getElementById("app")!);
