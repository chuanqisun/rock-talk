import { html, render } from "lit-html";
import "./style.css";

import { ConnectionsComponent } from "./connections/connections.component";
import { createComponent } from "./sdk/create-component";
import { IndividualInteraction } from "./simulation/individual.component";

const Main = createComponent(() => {
  const template = html`
    <header class="app-header">
      <h1>Rock talk</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
    </header>
    <main>
      <section>
        <h2>Individual</h2>
        ${IndividualInteraction({ rockName: "Rocky", voiceName: "echo" })} ${IndividualInteraction({ rockName: "Boulder", voiceName: "alloy" })}
      </section>
      <section>
        <h2>Group</h2>
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
