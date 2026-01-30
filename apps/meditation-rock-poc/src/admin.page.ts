import { html, render } from "lit-html";
import { BehaviorSubject, combineLatest, ignoreElements, map, merge, mergeWith, of, Subject, tap } from "rxjs";
import { mergeMap } from "rxjs/operators";
import "./admin.page.css";
import { signin, signout, useUser } from "./auth/auth";
import { apiKeys$, ConnectionsComponent } from "./connections/connections.component";
import {
  createRock,
  createRound,
  db,
  deleteRock,
  deleteRound,
  getRound,
  observeRocks,
  observeRounds,
  updateRock,
  updateRound,
  type DbRoundWithId,
  type DbRockWithId,
} from "./database/database";
import { generateThemes } from "./moderator/generate-themes";
import { type RoundType } from "./prompts/meditation-prompts";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";

type TabType = "rocks" | "rounds";

const AdminPage = createComponent(() => {
  const user$ = useUser();
  const activeTab$ = new BehaviorSubject<TabType>("rocks");

  const rocks$ = user$.pipe(
    mergeMap((user) => {
      if (user) {
        return observeRocks(db);
      }
      return of([]);
    })
  );

  const rounds$ = user$.pipe(
    mergeMap((user) => {
      if (user) {
        return observeRounds(db);
      }
      return of([]);
    })
  );

  const selectedRockId$ = new BehaviorSubject<string | null>(null);
  const selectedRoundId$ = new BehaviorSubject<string | null>(null);
  const generatingThemesFor$ = new BehaviorSubject<string | null>(null);
  const themesByRound$ = new BehaviorSubject<Record<string, string[]>>({});

  // Actions
  const createNewRock$ = new Subject<{ name: string; templateType: RoundType }>();
  const updateRockName$ = new Subject<{ rockId: string; name: string }>();
  const updateRockPrompt$ = new Subject<{ rockId: string; systemPrompt: string }>();
  const deleteRock$ = new Subject<string>();

  const createNewRound$ = new Subject<{ topic: string }>();
  const updateRoundTopic$ = new Subject<{ roundId: string; topic: string }>();
  const deleteRound$ = new Subject<string>();
  const generateThemesForRound$ = new Subject<string>();
  const deleteThemesForRound$ = new Subject<string>();

  // Effects
  const createNewRockEffect$ = createNewRock$.pipe(
    tap(async ({ name, templateType }) => {
      const rockId = await createRock(db, name, templateType);
      selectedRockId$.next(rockId);
    })
  );

  const updateRockNameEffect$ = updateRockName$.pipe(
    tap(async ({ rockId, name }) => {
      await updateRock(db, rockId, { name });
    })
  );

  const updateRockPromptEffect$ = updateRockPrompt$.pipe(
    tap(async ({ rockId, systemPrompt }) => {
      await updateRock(db, rockId, { systemPrompt });
    })
  );

  const deleteRockEffect$ = deleteRock$.pipe(
    tap(async (rockId) => {
      await deleteRock(db, rockId);
      if (selectedRockId$.value === rockId) {
        selectedRockId$.next(null);
      }
    })
  );

  const createNewRoundEffect$ = createNewRound$.pipe(
    tap(async ({ topic }) => {
      const roundId = await createRound(db, topic);
      selectedRoundId$.next(roundId);
    })
  );

  const updateRoundTopicEffect$ = updateRoundTopic$.pipe(
    tap(async ({ roundId, topic }) => {
      await updateRound(db, roundId, { topic });
    })
  );

  const deleteRoundEffect$ = deleteRound$.pipe(
    tap(async (roundId) => {
      await deleteRound(db, roundId);
      if (selectedRoundId$.value === roundId) {
        selectedRoundId$.next(null);
      }
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

          const existingThemes = round.themes || [];
          const currentThemes = [...existingThemes];

          generateThemes({ ...round, id: roundId }, apiKey, existingThemes).subscribe({
            next: (theme) => {
              const themeString = `${theme.theme}: ${theme.description}`;
              currentThemes.push(themeString);
              themesByRound$.next({
                ...themesByRound$.value,
                [roundId]: currentThemes,
              });
            },
            complete: async () => {
              await updateRound(db, roundId, { themes: currentThemes });
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
      await updateRound(db, roundId, { themes: [] });
      themesByRound$.next({
        ...themesByRound$.value,
        [roundId]: [],
      });
    }),
    ignoreElements()
  );

  // Handlers
  const handleCreateRock = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const name = formData.get("name") as string;
    const templateType = (formData.get("templateType") as RoundType) || "meditation";
    if (name) {
      createNewRock$.next({ name, templateType });
      form.reset();
    }
  };

  const handleCreateRound = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const topic = formData.get("topic") as string;
    if (topic) {
      createNewRound$.next({ topic });
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
    createNewRockEffect$,
    updateRockNameEffect$,
    updateRockPromptEffect$,
    deleteRockEffect$,
    createNewRoundEffect$,
    updateRoundTopicEffect$,
    deleteRoundEffect$,
    generateThemesEffect$,
    deleteThemesEffect$
  ).pipe(ignoreElements());

  const renderRocksList = (rocks: DbRockWithId[], selectedRockId: string | null) => {
    if (rocks.length === 0) {
      return html`<p>No rocks yet. Create one above!</p>`;
    }

    return html`
      <div class="items-list">
        ${rocks.map((rock) => {
          const isSelected = selectedRockId === rock.id;
          return html`
            <div class="item-card">
              <div class="item-header">
                <h3>🪨 ${rock.name}</h3>
                <div>
                  <button @click=${() => selectedRockId$.next(isSelected ? null : rock.id)}>
                    ${isSelected ? "Collapse" : "Expand"}
                  </button>
                  <button class="delete-button" @click=${() => deleteRock$.next(rock.id)}>Delete</button>
                </div>
              </div>
              ${isSelected
                ? html`
                    <div class="item-details">
                      <div class="form-field">
                        <label for="rock-name-${rock.id}">Name:</label>
                        <input
                          type="text"
                          id="rock-name-${rock.id}"
                          .value=${rock.name}
                          @input=${(e: Event) =>
                            updateRockName$.next({
                              rockId: rock.id,
                              name: (e.target as HTMLInputElement).value,
                            })}
                        />
                      </div>
                      <div class="form-field">
                        <label for="rock-prompt-${rock.id}">System Prompt:</label>
                        <textarea
                          id="rock-prompt-${rock.id}"
                          .value=${rock.systemPrompt}
                          placeholder="You are a meditation guide..."
                          @input=${(e: Event) =>
                            updateRockPrompt$.next({
                              rockId: rock.id,
                              systemPrompt: (e.target as HTMLTextAreaElement).value,
                            })}
                        ></textarea>
                      </div>
                      <details>
                        <summary>Sessions (${rock.sessions?.length || 0})</summary>
                        <div class="sessions-list">
                          ${rock.sessions?.map(
                            (session) => html`
                              <div class="session-card">
                                <strong>${new Date(session.createdAt).toLocaleString()}</strong>
                                <ul class="memory-list">
                                  ${session.memory?.map((mem) => html`<li>${mem}</li>`)}
                                </ul>
                              </div>
                            `
                          ) || html`<p>No sessions yet.</p>`}
                        </div>
                      </details>
                    </div>
                  `
                : ""}
            </div>
          `;
        })}
      </div>
    `;
  };

  const renderRoundsList = (rounds: DbRoundWithId[], rocks: DbRockWithId[], selectedRoundId: string | null) => {
    if (rounds.length === 0) {
      return html`<p>No rounds yet. Create one above!</p>`;
    }

    return html`
      <div class="items-list">
        ${rounds.map((round) => {
          const isSelected = selectedRoundId === round.id;
          return html`
            <div class="item-card">
              <div class="item-header">
                <h3>📿 ${round.topic}</h3>
                <div>
                  <button @click=${() => selectedRoundId$.next(isSelected ? null : round.id)}>
                    ${isSelected ? "Collapse" : "Expand"}
                  </button>
                  <button class="delete-button" @click=${() => deleteRound$.next(round.id)}>Delete</button>
                </div>
              </div>
              ${isSelected
                ? html`
                    <div class="item-details">
                      <div class="form-field">
                        <label for="round-topic-${round.id}">Topic:</label>
                        <input
                          type="text"
                          id="round-topic-${round.id}"
                          .value=${round.topic}
                          @input=${(e: Event) =>
                            updateRoundTopic$.next({
                              roundId: round.id,
                              topic: (e.target as HTMLInputElement).value,
                            })}
                        />
                      </div>

                      <div>
                        <strong>User Session Links (by Rock):</strong>
                        <ul>
                          ${rocks.map(
                            (rock) => html`
                              <li>
                                <a
                                  class="user-link"
                                  href="./user.html?round=${round.id}&rock=${rock.id}"
                                  target="_blank"
                                >
                                  ${rock.name}
                                </a>
                              </li>
                            `
                          )}
                        </ul>
                      </div>

                      <details>
                        <summary>Sessions (${round.sessions?.length || 0})</summary>
                        <div class="sessions-list">
                          ${round.sessions?.map(
                            (session) => html`
                              <div class="session-card">
                                <strong>${new Date(session.createdAt).toLocaleString()}</strong>
                                <br />
                                <small>Rock: ${session.rockId}</small>
                                <ul class="memory-list">
                                  ${session.memory?.map((mem) => html`<li>${mem}</li>`)}
                                </ul>
                              </div>
                            `
                          ) || html`<p>No sessions yet.</p>`}
                        </div>
                      </details>

                      <details class="themes-details">
                        <summary>Themes</summary>
                        <div class="themes-list">
                          <div class="themes-controls">
                            <button
                              @click=${() => generateThemesForRound$.next(round.id)}
                              ?disabled=${observe(generatingThemesFor$.pipe(map((generating) => generating === round.id)))}
                            >
                              ${observe(
                                generatingThemesFor$.pipe(
                                  map((generating) => (generating === round.id ? "Generating..." : "Generate Themes"))
                                )
                              )}
                            </button>
                            <button
                              @click=${() => deleteThemesForRound$.next(round.id)}
                              class="delete-button"
                              ?disabled=${observe(
                                combineLatest([generatingThemesFor$, themesByRound$.asObservable()]).pipe(
                                  map(([generating, themesByRound]) => {
                                    const streamingThemes = themesByRound[round.id] || [];
                                    const dbThemes = round.themes || [];
                                    const allThemes = streamingThemes.length > 0 ? streamingThemes : dbThemes;
                                    return generating === round.id || allThemes.length === 0;
                                  })
                                )
                              )}
                            >
                              Delete All Themes
                            </button>
                          </div>
                          ${observe(
                            combineLatest([generatingThemesFor$, themesByRound$.asObservable()]).pipe(
                              map(([generating, themesByRound]) => {
                                const streamingThemes = themesByRound[round.id] || [];
                                const dbThemes = round.themes || [];
                                const allThemes = streamingThemes.length > 0 ? streamingThemes : dbThemes;

                                return allThemes.length > 0
                                  ? html`
                                      <ul>
                                        ${allThemes.map((theme) => html`<li>${theme}</li>`)}
                                        ${generating === round.id
                                          ? html`<li style="opacity: 0.6;"><em>Generating...</em></li>`
                                          : ""}
                                      </ul>
                                    `
                                  : html`<p>No themes</p>`;
                              })
                            )
                          )}
                        </div>
                      </details>
                    </div>
                  `
                : ""}
            </div>
          `;
        })}
      </div>
    `;
  };

  const template = html`
    <header class="app-header">
      <h1>🧘 Meditation Rock Admin</h1>
      <menu class="action-menu">
        <button commandfor="connection-dialog" command="show-modal">Setup</button>
        ${observe(signInButton)} ${observe(userEmail$)}
      </menu>
    </header>
    <main>
      <div class="tabs">
        <button
          class="tab-button ${observe(activeTab$.pipe(map((tab) => (tab === "rocks" ? "active" : ""))))}"
          @click=${() => activeTab$.next("rocks")}
        >
          🪨 Rocks
        </button>
        <button
          class="tab-button ${observe(activeTab$.pipe(map((tab) => (tab === "rounds" ? "active" : ""))))}"
          @click=${() => activeTab$.next("rounds")}
        >
          📿 Rounds
        </button>
      </div>

      ${observe(
        activeTab$.pipe(
          map((tab) =>
            tab === "rocks"
              ? html`
                  <section>
                    <h2>Create New Rock</h2>
                    <form @submit=${handleCreateRock} class="create-form">
                      <div class="form-field">
                        <label for="name">Rock Name:</label>
                        <input type="text" id="name" name="name" required placeholder="Enter rock name" />
                      </div>
                      <div class="form-field">
                        <label for="templateType">Template:</label>
                        <select id="templateType" name="templateType" required>
                          <option value="meditation">🧘 Meditation</option>
                          <option value="guided-reflection">💬 Guided Reflection</option>
                        </select>
                      </div>
                      <button type="submit">Create Rock</button>
                    </form>
                  </section>

                  <section>
                    <h2>Rocks</h2>
                    ${observe(
                      combineLatest([rocks$, selectedRockId$]).pipe(
                        map(([rocks, selectedRockId]) => renderRocksList(rocks, selectedRockId))
                      )
                    )}
                  </section>
                `
              : html`
                  <section>
                    <h2>Create New Round</h2>
                    <form @submit=${handleCreateRound} class="create-form">
                      <div class="form-field">
                        <label for="topic">Topic:</label>
                        <input type="text" id="topic" name="topic" required placeholder="Enter topic" />
                      </div>
                      <button type="submit">Create Round</button>
                    </form>
                  </section>

                  <section>
                    <h2>Rounds</h2>
                    ${observe(
                      combineLatest([rounds$, rocks$, selectedRoundId$]).pipe(
                        map(([rounds, rocks, selectedRoundId]) => renderRoundsList(rounds, rocks, selectedRoundId))
                      )
                    )}
                  </section>
                `
          )
        )
      )}
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
