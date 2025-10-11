import { html, render } from "lit-html";
import { BehaviorSubject } from "rxjs";
import "./style.css";

import { ConnectionsComponent } from "./connections/connections.component";
import { loadApiKeys, type ApiKeys } from "./connections/storage";
import { createComponent } from "./sdk/create-component";

const Main = createComponent(() => {
  const apiKeys$ = new BehaviorSubject<ApiKeys>(loadApiKeys());

  const template = html`
    <header class="app-header">
      <h1>Rock talk</h1>
      <button commandfor="connection-dialog" command="show-modal">Setup</button>
    </header>
    <dialog class="connection-form" id="connection-dialog">
      <div class="connections-dialog-body">
        ${ConnectionsComponent({ apiKeys$ })}
        <form method="dialog">
          <button>Close</button>
        </form>
      </div>
    </dialog>
  `;

  return template;
});

render(Main(), document.getElementById("app")!);
