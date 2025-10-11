import { html } from "lit-html";
import { map } from "rxjs";
import { createComponent } from "../sdk/create-component";
import { observe } from "../sdk/observe-directive";
import { rocks$ } from "./garden.component";

export const MemoryComponent = createComponent(() => {
  const memories$ = rocks$.pipe(
    map((rocks) =>
      rocks.map(
        (rock) => html`
          <details>
            <summary>${rock.rockName}</summary>
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
