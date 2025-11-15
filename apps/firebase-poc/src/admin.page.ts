import { html, render } from "lit-html";
import { BehaviorSubject, combineLatest, ignoreElements, map, merge, mergeWith, of, Subject, tap } from "rxjs";
import "./admin.page.css";
import { signin, signout, useUser } from "./auth/auth";
import { ConnectionsComponent } from "./connections/connections.component";
import { createRound, db, getRound, observeRounds, updateDeviceInRound, updateRound } from "./database/database";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";

const AdminPage = createComponent(() => {
  const user$ = useUser();
  const rounds$ = observeRounds(db);
  const selectedRoundId$ = new BehaviorSubject<string | null>(null);
  const selectedDeviceIndex$ = new BehaviorSubject<number | null>(null);

  const createNewRound$ = new Subject<{ topic: string; deviceCount: number }>();
  const updateRoundTopic$ = new Subject<{ roundId: string; topic: string }>();
  const updateDeviceName$ = new Subject<{ roundId: string; deviceIndex: number; name: string }>();
  const updateDeviceSystemPrompt$ = new Subject<{ roundId: string; deviceIndex: number; systemPrompt: string }>();

  const createNewRoundEffect$ = createNewRound$.pipe(
    tap(async ({ topic, deviceCount }) => {
      const roundId = await createRound(db, topic, deviceCount);
      selectedRoundId$.next(roundId);
    })
  );

  const updateRoundTopicEffect$ = updateRoundTopic$.pipe(
    tap(async ({ roundId, topic }) => {
      const round = await getRound(db, roundId);

      if (round) {
        await updateRound(db, roundId, { ...round, topic });
      }
    })
  );

  const updateDeviceNameEffect$ = updateDeviceName$.pipe(
    tap(async ({ roundId, deviceIndex, name }) => {
      await updateDeviceInRound(db, roundId, deviceIndex, { name });
    })
  );

  const updateDeviceSystemPromptEffect$ = updateDeviceSystemPrompt$.pipe(
    tap(async ({ roundId, deviceIndex, systemPrompt }) => {
      await updateDeviceInRound(db, roundId, deviceIndex, { systemPrompt });
    })
  );

  const handleCreateRound = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const topic = formData.get("topic") as string;
    const deviceCount = parseInt(formData.get("deviceCount") as string);
    if (topic && deviceCount > 0) {
      createNewRound$.next({ topic, deviceCount });
      form.reset();
    }
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

  const effects$ = merge(createNewRoundEffect$, updateRoundTopicEffect$, updateDeviceNameEffect$, updateDeviceSystemPromptEffect$).pipe(ignoreElements());

  const template = html`
    <header class="app-header">
      <h1>Rock Talk Moderator</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
      ${observe(signInButton)} ${observe(userEmail$)}
    </header>
    <main>
      <section>
        <h2>Create New Round</h2>
        <form @submit=${handleCreateRound} class="create-round-form">
          <div class="form-field">
            <label for="topic">Topic:</label>
            <input type="text" id="topic" name="topic" required placeholder="Enter discussion topic" />
          </div>
          <div class="form-field">
            <label for="deviceCount">Number of Devices:</label>
            <input type="number" id="deviceCount" name="deviceCount" min="1" max="10" value="5" required />
          </div>
          <button type="submit">Create Round</button>
        </form>
      </section>

      <section>
        <h2>Rounds</h2>
        ${observe(
          combineLatest([rounds$, selectedRoundId$]).pipe(
            map(([rounds, selectedRoundId]) =>
              rounds.length === 0
                ? html`<p>No rounds yet. Create one above!</p>`
                : html`
                    <div class="rounds-list">
                      ${rounds.map((round, index) => {
                        const roundId = round.id;
                        return html`
                          <div class="round-card">
                            <div class="round-header">
                              <h3>
                                Round ${index + 1}
                                <small>${new Date(round.createdAt).toLocaleString()}</small>
                              </h3>
                              <button @click=${() => selectedRoundId$.next(selectedRoundId === roundId ? null : roundId)}>
                                ${selectedRoundId === roundId ? "Collapse" : "Expand"}
                              </button>
                            </div>
                            ${selectedRoundId === roundId
                              ? html`
                                  <div class="round-details">
                                    <div class="form-field">
                                      <label for="topic-${roundId}">Topic:</label>
                                      <input
                                        type="text"
                                        id="topic-${roundId}"
                                        .value=${round.topic}
                                        @input=${(e: Event) =>
                                          updateRoundTopic$.next({
                                            roundId,
                                            topic: (e.target as HTMLInputElement).value,
                                          })}
                                      />
                                    </div>
                                    <h4>Devices</h4>
                                    <div class="devices-list">
                                      ${round.devices?.map(
                                        (device, deviceIndex) => html`
                                          <div class="device-card">
                                            <div class="form-field">
                                              <label for="device-name-${roundId}-${deviceIndex}">Device Name:</label>
                                              <input
                                                type="text"
                                                id="device-name-${roundId}-${deviceIndex}"
                                                .value=${device.name}
                                                @input=${(e: Event) =>
                                                  updateDeviceName$.next({
                                                    roundId,
                                                    deviceIndex,
                                                    name: (e.target as HTMLInputElement).value,
                                                  })}
                                              />
                                            </div>
                                            <div class="form-field">
                                              <label for="device-prompt-${roundId}-${deviceIndex}">System Prompt:</label>
                                              <textarea
                                                id="device-prompt-${roundId}-${deviceIndex}"
                                                .value=${device.systemPrompt}
                                                placeholder="You are a happy rock..."
                                                @input=${(e: Event) =>
                                                  updateDeviceSystemPrompt$.next({
                                                    roundId,
                                                    deviceIndex,
                                                    systemPrompt: (e.target as HTMLTextAreaElement).value,
                                                  })}
                                              ></textarea>
                                            </div>
                                            <div>
                                              <button @click=${() => selectedDeviceIndex$.next(deviceIndex)}>
                                                View Transcripts (${device.sessions?.length ?? 0} sessions)
                                              </button>
                                              ${device.assignedTo ? html`<span>Assigned to: ${device.assignedTo}</span>` : ""}
                                              <a href="./user.html?round=${roundId}&device=${deviceIndex}" target="_blank">Open User View</a>
                                            </div>
                                            ${selectedDeviceIndex$.value === deviceIndex
                                              ? html`
                                                  <div class="sessions-list">
                                                    ${device.sessions?.length === 0
                                                      ? html`<p>No sessions yet</p>`
                                                      : html`
                                                          ${device.sessions?.map(
                                                            (session, sessionIndex) => html`
                                                              <div class="session-card">
                                                                <h5>Session ${sessionIndex + 1} - ${new Date(session.createdAt).toLocaleString()}</h5>
                                                                <div class="transcripts">
                                                                  ${session.transcripts?.map(
                                                                    (transcript) => html`
                                                                      <div class="transcript-entry ${transcript.role}">
                                                                        <strong>${transcript.role}:</strong>
                                                                        <span>${transcript.content}</span>
                                                                      </div>
                                                                    `
                                                                  )}
                                                                </div>
                                                              </div>
                                                            `
                                                          )}
                                                        `}
                                                  </div>
                                                `
                                              : ""}
                                          </div>
                                        `
                                      )}
                                    </div>
                                  </div>
                                `
                              : ""}
                          </div>
                        `;
                      })}
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

  return of(template).pipe(mergeWith(effects$));
});

render(AdminPage(), document.getElementById("app")!);
