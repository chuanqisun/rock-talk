import { html, render } from "lit-html";
import { map, mergeWith, of, Subject, tap, withLatestFrom } from "rxjs";
import "./admin.page.css";
import { ConnectionsComponent } from "./connections/connections.component";
import { db, observeDevices } from "./database/database";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";

const AdminPage = createComponent(() => {
  // Subscribe to devices in real-time
  const devices$ = observeDevices(db).pipe(tap((devices) => console.log("Devices updated:", devices)));

  // Handle session clicks
  const sessionClick$ = new Subject<{ deviceId: number; sessionIndex: number }>();
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

  const template = html`
    <header class="app-header">
      <h1>Rock Talk Admin</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
    </header>
    <main>
      <section>
        <h2>Devices and Sessions</h2>
        ${observe(
          devices$.pipe(
            map(
              (devices) => html`
                <div class="devices-list">
                  ${devices.map(
                    (device) => html`
                      <div class="device">
                        <h3>${device.name} (ID: ${device.id})</h3>
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
