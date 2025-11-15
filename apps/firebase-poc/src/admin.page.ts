import { html, render } from "lit-html";
import { BehaviorSubject, combineLatest, ignoreElements, map, merge, mergeWith, of, Subject, tap } from "rxjs";
import { mergeMap } from "rxjs/operators";
import "./admin.page.css";
import { signin, signout, useUser } from "./auth/auth";
import { apiKeys$, ConnectionsComponent } from "./connections/connections.component";
import { createRound, db, getRound, observeRounds, updateDeviceInRound, updateRound } from "./database/database";
import { generateThemes } from "./moderator/generate-themes";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";

const AdminPage = createComponent(() => {
  const user$ = useUser();
  const rounds$ = observeRounds(db);
  const selectedRoundId$ = new BehaviorSubject<string | null>(null);
  const selectedDeviceIndex$ = new BehaviorSubject<{ roundId: string; deviceIndex: number } | null>(null);
  const generatingThemesFor$ = new BehaviorSubject<string | null>(null);
  const themesByRound$ = new BehaviorSubject<Record<string, string[]>>({});

  const createNewRound$ = new Subject<{ topic: string; deviceCount: number }>();
  const updateRoundTopic$ = new Subject<{ roundId: string; topic: string }>();
  const updateDeviceName$ = new Subject<{ roundId: string; deviceIndex: number; name: string }>();
  const updateDeviceSystemPrompt$ = new Subject<{ roundId: string; deviceIndex: number; systemPrompt: string }>();
  const generateThemesForRound$ = new Subject<string>();
  const deleteThemesForRound$ = new Subject<string>();

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

  const generateThemesEffect$ = generateThemesForRound$.pipe(
    tap((roundId) => {
      generatingThemesFor$.next(roundId);
    }),
    mergeMap((roundId) => {
      return new Promise<void>(async (resolve) => {
        try {
          const apiKey = apiKeys$.value.openai;
          if (!apiKey) {
            console.error("OpenAI API key not configured");
            generatingThemesFor$.next(null);
            resolve();
            return;
          }

          const round = await getRound(db, roundId);
          if (!round) {
            console.error("Round not found");
            generatingThemesFor$.next(null);
            resolve();
            return;
          }

          // Start with existing database themes and append new ones
          const existingThemes = round.themes || [];
          const currentThemes = [...existingThemes];

          // Pass existing themes to avoid duplicates
          generateThemes(round, apiKey, existingThemes).subscribe({
            next: (theme) => {
              const themeString = `${theme.theme}: ${theme.description}`;
              currentThemes.push(themeString);
              themesByRound$.next({
                ...themesByRound$.value,
                [roundId]: currentThemes,
              });
            },
            complete: async () => {
              // Save themes to database when all are collected (they're already appended)
              round.themes = currentThemes;
              await updateRound(db, roundId, round);
              generatingThemesFor$.next(null);
              resolve();
            },
            error: (error) => {
              console.error("Error generating themes:", error);
              generatingThemesFor$.next(null);
              resolve();
            },
          });
        } catch (error) {
          console.error("Error in theme generation:", error);
          generatingThemesFor$.next(null);
          resolve();
        }
      });
    }),
    ignoreElements()
  );

  const deleteThemesEffect$ = deleteThemesForRound$.pipe(
    tap(async (roundId) => {
      const round = await getRound(db, roundId);
      if (round) {
        round.themes = [];
        await updateRound(db, roundId, round);
        themesByRound$.next({
          ...themesByRound$.value,
          [roundId]: [],
        });
      }
    }),
    ignoreElements()
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

  const effects$ = merge(
    createNewRoundEffect$,
    updateRoundTopicEffect$,
    updateDeviceNameEffect$,
    updateDeviceSystemPromptEffect$,
    generateThemesEffect$,
    deleteThemesEffect$
  ).pipe(ignoreElements());

  const template = html`
    <header class="app-header">
      <h1>Rock Talk Moderator</h1>
      <menu class="action-menu">
        <button commandfor="connection-dialog" command="show-modal">Setup</button>
        ${observe(signInButton)} ${observe(userEmail$)}
      </menu>
    </header>
    <main>
      <section>
        <h2>Create New Round</h2>
        <form @submit=${handleCreateRound} class="create-round-form">
          <menu class="form-field">
            <label for="topic">Topic:</label>
            <input type="text" id="topic" name="topic" required placeholder="Enter discussion topic" />
          </menu>
          <menu class="form-field">
            <label for="deviceCount">Number of Devices:</label>
            <input type="number" id="deviceCount" name="deviceCount" min="1" max="10" value="5" required />
          </menu>
          <button type="submit">Create Round</button>
        </form>
      </section>

      <section>
        <h2>Rounds</h2>
        ${observe(
          combineLatest([rounds$, selectedRoundId$, selectedDeviceIndex$]).pipe(
            map(([rounds, selectedRoundId, selectedDeviceIndex]) =>
              rounds.length === 0
                ? html`<p>No rounds yet. Create one above!</p>`
                : html`
                    <menu class="rounds-list">
                      ${rounds.map((round, index) => {
                        const roundId = round.id;
                        return html`
                          <menu class="round-card">
                            <menu class="round-header">
                              <h3>
                                Round ${index + 1}
                                <small>${new Date(round.createdAt).toLocaleString()}</small>
                              </h3>
                              <button @click=${() => selectedRoundId$.next(selectedRoundId === roundId ? null : roundId)}>
                                ${selectedRoundId === roundId ? "Collapse" : "Expand"}
                              </button>
                            </menu>
                            ${selectedRoundId === roundId
                              ? html`
                                  <menu class="round-details">
                                    <menu class="form-field">
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
                                    </menu>
                                    <details class="devices-details">
                                      <summary>Devices</summary>
                                      <menu class="devices-list">
                                        ${round.devices?.map(
                                          (device, deviceIndex) => html`
                                            <menu class="device-card">
                                              <menu class="form-field">
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
                                              </menu>
                                              <menu class="form-field">
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
                                              </menu>
                                              <menu>
                                                <button
                                                  @click=${() => {
                                                    const isSelected =
                                                      selectedDeviceIndex?.roundId === roundId && selectedDeviceIndex?.deviceIndex === deviceIndex;
                                                    selectedDeviceIndex$.next(isSelected ? null : { roundId, deviceIndex });
                                                  }}
                                                >
                                                  View Transcripts (${device.sessions?.length ?? 0} sessions)
                                                </button>
                                                ${device.assignedTo ? html`<span>Assigned to: ${device.assignedTo}</span>` : ""}
                                                <a href="./user.html?round=${roundId}&device=${deviceIndex}" target="_blank">Open User View</a>
                                              </menu>
                                              ${selectedDeviceIndex?.roundId === roundId && selectedDeviceIndex?.deviceIndex === deviceIndex
                                                ? html`
                                                    <menu class="sessions-list">
                                                      ${device.sessions?.length === 0
                                                        ? html`<p>No sessions yet</p>`
                                                        : html`
                                                            ${device.sessions?.map(
                                                              (session, sessionIndex) => html`
                                                                <menu class="session-card">
                                                                  <h5>Session ${sessionIndex + 1} - ${new Date(session.createdAt).toLocaleString()}</h5>
                                                                  <menu class="transcripts">
                                                                    ${session.transcripts?.map(
                                                                      (transcript) => html`
                                                                        <menu class="transcript-entry ${transcript.role}">
                                                                          <strong>${transcript.role}:</strong>
                                                                          <span>${transcript.content}</span>
                                                                        </menu>
                                                                      `
                                                                    )}
                                                                  </menu>
                                                                </menu>
                                                              `
                                                            )}
                                                          `}
                                                    </menu>
                                                  `
                                                : ""}
                                            </menu>
                                          `
                                        )}
                                      </menu>
                                    </details>
                                    <details class="themes-details">
                                      <summary>Themes</summary>
                                      <menu class="themes-list">
                                        <menu class="themes-controls">
                                          <button
                                            @click=${() => generateThemesForRound$.next(roundId)}
                                            ?disabled=${observe(generatingThemesFor$.pipe(map((generating) => generating === roundId)))}
                                          >
                                            ${observe(
                                              generatingThemesFor$.pipe(
                                                map((generating) => (generating === roundId ? "Generating..." : "Generate More Themes"))
                                              )
                                            )}
                                          </button>
                                          <button
                                            @click=${() => deleteThemesForRound$.next(roundId)}
                                            class="delete-button"
                                            ?disabled=${observe(
                                              combineLatest([generatingThemesFor$, themesByRound$.asObservable()]).pipe(
                                                map(([generating, themesByRound]) => {
                                                  const streamingThemes = themesByRound[roundId] || [];
                                                  const dbThemes = round.themes || [];
                                                  const allThemes = streamingThemes.length > 0 ? streamingThemes : dbThemes;
                                                  return generating === roundId || allThemes.length === 0;
                                                })
                                              )
                                            )}
                                          >
                                            Delete All Themes
                                          </button>
                                        </menu>
                                        ${observe(
                                          combineLatest([generatingThemesFor$, themesByRound$.asObservable()]).pipe(
                                            map(([generating, themesByRound]) => {
                                              const streamingThemes = themesByRound[roundId] || [];
                                              const dbThemes = round.themes || [];
                                              const allThemes = streamingThemes.length > 0 ? streamingThemes : dbThemes;

                                              return allThemes.length > 0
                                                ? html`
                                                    <ul>
                                                      ${allThemes.map((theme) => html`<li>${theme}</li>`)}
                                                      ${generating === roundId ? html`<li style="opacity: 0.6;"><em>Generating...</em></li>` : ""}
                                                    </ul>
                                                  `
                                                : html`<p>No themes</p>`;
                                            })
                                          )
                                        )}
                                      </menu>
                                    </details>
                                  </menu>
                                `
                              : ""}
                          </menu>
                        `;
                      })}
                    </menu>
                  `
            )
          )
        )}
      </section>
    </main>

    <dialog class="connection-form" id="connection-dialog">
      <menu class="connections-dialog-body">
        ${ConnectionsComponent()}
        <form method="dialog">
          <button>Close</button>
        </form>
      </menu>
    </dialog>
  `;

  return of(template).pipe(mergeWith(effects$));
});

render(AdminPage(), document.getElementById("app")!);
