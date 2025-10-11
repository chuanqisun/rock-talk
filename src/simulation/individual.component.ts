import { html } from "lit-html";
import { ignoreElements, map, merge, mergeWith, of } from "rxjs";
import { createComponent } from "../sdk/create-component";
import { observe } from "../sdk/observe-directive";
import { useRealtime } from "./realtime";

export interface IndividualInteractionProps {
  rockName: string;
  voiceName: string;
}
export const IndividualInteraction = createComponent((props: IndividualInteractionProps) => {
  const realtime = useRealtime({
    voiceName: props.voiceName,
    agentName: props.rockName,
  });

  const buttonLabel$ = realtime.status$.pipe(
    map((state) => {
      if (state === "idle") return `Start ${props.rockName}`;
      if (state === "connecting") return "Connecting...";
      if (state === "connected") return "Connected";
      return "Start";
    })
  );

  const effects$ = merge(realtime.effects$).pipe(ignoreElements());
  const template = html` <button @click=${() => (realtime.status$.value === "idle" ? realtime.start() : realtime.stop())}>${observe(buttonLabel$)}</button> `;

  return of(template).pipe(mergeWith(effects$));
});
