import { BehaviorSubject } from "rxjs";

export interface Rock {
  rockName: string;
  rockVoice: string;
  userName: string | null;
}

export const rocks$ = new BehaviorSubject<Rock[]>([
  { rockName: "Boulder", rockVoice: "alloy", userName: "John" },
  { rockName: "Pebble", rockVoice: "shimmer", userName: "Sue" },
  { rockName: "Stone", rockVoice: "fable", userName: null },
  { rockName: "Granite", rockVoice: "ash", userName: null },
]);
