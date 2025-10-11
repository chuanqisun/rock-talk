import { html, render } from "lit-html";
import "./style.css";

import { repeat } from "lit-html/directives/repeat.js";
import { map } from "rxjs";
import { ConnectionsComponent } from "./connections/connections.component";
import { createComponent } from "./sdk/create-component";
import { observe } from "./sdk/observe-directive";
import { IndividualInteraction } from "./simulation/individual.component";
import { rocks$ } from "./simulation/rocks.component";

const Main = createComponent(() => {
  const IndividualRocks$ = rocks$.pipe(
    map((rocks) =>
      repeat(
        rocks.filter((rock) => rock.userName !== null),
        (rock) => rock.rockName,
        (rock) => IndividualInteraction({ rockName: rock.rockName, voiceName: rock.rockVoice })
      )
    )
  );

  const AvailableRocks$ = rocks$.pipe(
    map((rocks) =>
      repeat(
        rocks.filter((rock) => rock.userName === null),
        (rock) => rock.rockName,
        (rock) => html`<option value="${rock.rockName}">${rock.rockName}</option>`
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
        <p>
          <b>Read the following statement to bind with a rock.</b><br />
          <em>My name is __, I agree to adopt __ as my rock buddy and treat it with care and respect.</em>
        </p>
        <div>
          <b>Available rocks</b>
          ${observe(AvailableRocks$)}
        </div>
      </section>
      <section>
        <h2>Individual</h2>
        ${observe(IndividualRocks$)}
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
