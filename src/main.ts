import { html, render } from "lit-html";
import "./prototype.css";

import { repeat } from "lit-html/directives/repeat.js";
import { map } from "rxjs";
import { ConnectionsComponent } from "./connections/connections.component";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";
import { DiscussionComponent } from "./simulation/discussion.component";
import { RockAdoption, rocks$ } from "./simulation/garden.component";
import { IndividualInteraction } from "./simulation/individual.component";
import { MemoryComponent } from "./simulation/memory.component";

const Main = createComponent(() => {
  const IndividualRocks$ = rocks$.pipe(
    map((rocks) =>
      repeat(
        rocks.filter((rock) => rock.userName !== null),
        (rock) => rock.rockName,
        (rock) => IndividualInteraction({ rockName: rock.rockName, voiceName: rock.rockVoice, humanName: rock.userName! })
      )
    )
  );

  const template = html`
    <header class="app-header">
      <h1>Rock talk</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
    </header>
    <main>
      <section>
        <h2>Group</h2>
        ${RockAdoption()} ${DiscussionComponent()}
      </section>
      <section>
        <h2>Individual</h2>
        ${observe(IndividualRocks$)}
      </section>
      <section>
        <h2>Memories</h2>
        ${MemoryComponent()}
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

  return template;
});

render(Main(), document.getElementById("app")!);
