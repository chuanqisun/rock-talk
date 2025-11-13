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
      systemPrompt: "",
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

  const template = html`
    <header class="app-header">
      <h1>Rock Talk Admin</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
      ${observe(signInButton)}
    </header>
    <main>
      <section>
        <h2>Devices and Sessions</h2>
        <button @click=${resetDevices}>Reset devices</button>
        ${observe(
          devices$.pipe(
            map(
              (devices) => html`
                <div class="devices-list">
                  ${devices.map(
                    (device) => html`
                      <div class="device">
                        <h3><a href="./user.html?rock=${device.id}"> ${device.name} (ID: ${device.id})</a></h3>
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
                        <div class="system-prompt">
                          <label for="device-${device.id}">System Prompt:</label>
                          <textarea
                            id="device-${device.id}"
                            .value=${device.systemPrompt}
                            @input=${(e: Event) => updateSystemPrompt(device.id, (e.target as HTMLTextAreaElement).value)}
                          ></textarea>
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
