import { html } from "lit-html";
import { combineLatest, map } from "rxjs";
import { createComponent } from "../sdk/create-component";
import { observe } from "../sdk/observe-directive";
import { currentConnection$ } from "./discussion.component";
import { rocks$ } from "./garden.component";

export const MemoryComponent = createComponent(() => {
  const memories$ = combineLatest([rocks$, currentConnection$]).pipe(
    map(([rocks, currentConnections]) =>
      rocks.map(
        (rock) => html`
          <details>
            <summary>${rock.rockName} ${currentConnections.includes(rock.rockName) ? html`<strong>🟢</strong>` : null}</summary>
            <ul>
              ${rock.memories.map((memory) => html`<li>${memory}</li>`)} ${rock.memories.length === 0 ? html`<li><em>No memories yet</em></li>` : null}
            </ul>
          </details>
        `
      )
    )
  );

  const template = html` <div>${observe(memories$)}</div> `;

  return template;
});
