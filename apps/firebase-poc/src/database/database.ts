import { initializeApp } from "firebase/app";
import { Database, get, getDatabase, onValue, push, ref, set } from "firebase/database";
import { Observable } from "rxjs";
import { defaultRockPrompt } from "../prompts/rock-prompts";

export interface DbRound {
  createdAt: string;
  topic: string;
  devices?: DbDevice[];
  themes?: string[];
}

export interface DbDevice {
  name: string;
  systemPrompt: string;
  sessions?: DbSession[];
  assignedTo?: string;
}

export interface DbSession {
  createdAt: string;
  transcripts?: DbTranscript[];
}

export interface DbTranscript {
  role: "user" | "model";
  content: string;
}

export interface FirebaseConnection {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function connectToDatabase(config: FirebaseConnection) {
  // Initialize Firebase
  const app = initializeApp(config);
  const db = getDatabase(app);
  return { app, db };
}

export async function listRounds(db: Database): Promise<DbRound[]> {
  const roundsRef = ref(db, "rounds");
  const snapshot = await get(roundsRef);

  if (!snapshot.exists()) {
    return [];
  }

  const roundsData = snapshot.val();
  const rounds: DbRound[] = [];

  for (const roundData of Object.values(roundsData as Record<string, any>)) {
    rounds.push({
      createdAt: roundData.createdAt,
      topic: roundData.topic,
      devices: roundData.devices || [],
      themes: roundData.themes || [],
    });
  }

  return rounds;
}

export interface DbRoundWithId extends DbRound {
  id: string;
}

export function observeRounds(db: Database): Observable<DbRoundWithId[]> {
  return new Observable((subscriber) => {
    const roundsRef = ref(db, "rounds");

    const unsubscribe = onValue(
      roundsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          subscriber.next([]);
          return;
        }

        const roundsData = snapshot.val();
        const rounds: DbRoundWithId[] = [];

        for (const [roundId, roundData] of Object.entries(roundsData as Record<string, any>)) {
          // Convert devices object to array and ensure sessions are properly converted
          const devices = (roundData.devices || []).map((device: any) => {
            const sessions = device.sessions ? Object.values(device.sessions) : [];
            // Sort sessions by createdAt in descending order (newest first)
            sessions.sort((a: any, b: any) => {
              const dateA = new Date(a.createdAt).getTime();
              const dateB = new Date(b.createdAt).getTime();
              return dateB - dateA;
            });

            return {
              name: device.name,
              systemPrompt: device.systemPrompt,
              assignedTo: device.assignedTo,
              sessions,
            };
          });

          rounds.push({
            id: roundId,
            createdAt: roundData.createdAt,
            topic: roundData.topic,
            devices,
            themes: roundData.themes || [],
          });
        }

        // Sort rounds by createdAt in descending order (newest first)
        rounds.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
        });

        subscriber.next(rounds);
      },
      (error) => {
        subscriber.error(error);
      }
    );

    return () => {
      unsubscribe();
    };
  });
}

export async function createRound(db: Database, topic: string, deviceCount: number): Promise<string> {
  const roundsRef = ref(db, "rounds");
  const newRoundRef = push(roundsRef);

  const devices: DbDevice[] = Array.from({ length: deviceCount }, (_, i) => ({
    name: `Device ${i + 1}`,
    systemPrompt: defaultRockPrompt(topic),
    sessions: [],
  }));

  const round: DbRound = {
    createdAt: new Date().toISOString(),
    topic,
    devices,
    themes: [],
  };

  await set(newRoundRef, round);
  return newRoundRef.key!;
}

export async function updateRound(db: Database, roundId: string, round: DbRound): Promise<void> {
  // Remove undefined values to prevent Firebase errors
  const cleanRound = {
    createdAt: round.createdAt,
    topic: round.topic,
    devices: round.devices?.map((device) => ({
      name: device.name,
      systemPrompt: device.systemPrompt,
      ...(device.assignedTo && { assignedTo: device.assignedTo }),
      sessions: device.sessions || [],
    })),
    themes: round.themes || [],
  };
  await set(ref(db, `rounds/${roundId}`), cleanRound);
}

export async function updateDeviceInRound(db: Database, roundId: string, deviceIndex: number, updates: Partial<DbDevice>): Promise<void> {
  const deviceRef = ref(db, `rounds/${roundId}/devices/${deviceIndex}`);
  const snapshot = await get(deviceRef);
  if (snapshot.exists()) {
    const device = snapshot.val();
    await set(deviceRef, { ...device, ...updates });
  }
}

export async function uploadSession(db: Database, roundId: string, deviceIndex: number, session: DbSession): Promise<void> {
  const sessionsRef = ref(db, `rounds/${roundId}/devices/${deviceIndex}/sessions`);
  const newSessionRef = push(sessionsRef);
  await set(newSessionRef, session);
}

export async function fetchDeviceConfig(roundId: string, deviceIndex: number) {
  const systemPromptRef = ref(db, `rounds/${roundId}/devices/${deviceIndex}/systemPrompt`);
  const snapshot = await get(systemPromptRef);
  if (snapshot.exists()) {
    return snapshot.val() || "";
  }
  return "";
}

export async function getCurrentRoundId(db: Database): Promise<string | null> {
  const roundsRef = ref(db, "rounds");
  const snapshot = await get(roundsRef);

  if (!snapshot.exists()) {
    return null;
  }

  const roundsData = snapshot.val();
  const roundIds = Object.keys(roundsData);

  // Return the most recent round (last in the list)
  return roundIds.length > 0 ? roundIds[roundIds.length - 1] : null;
}

export async function getRound(db: Database, roundId: string): Promise<DbRound | null> {
  const roundRef = ref(db, `rounds/${roundId}`);
  const snapshot = await get(roundRef);

  if (!snapshot.exists()) {
    return null;
  }

  const roundData = snapshot.val();

  // Convert devices object to array and ensure sessions are properly converted
  const devices = (roundData.devices || []).map((device: any) => ({
    name: device.name,
    systemPrompt: device.systemPrompt,
    assignedTo: device.assignedTo,
    sessions: device.sessions ? Object.values(device.sessions) : [],
  }));

  return {
    createdAt: roundData.createdAt,
    topic: roundData.topic,
    devices,
    themes: roundData.themes || [],
  };
}

export function observeRound(db: Database, roundId: string): Observable<DbRound | null> {
  return new Observable((subscriber) => {
    const roundRef = ref(db, `rounds/${roundId}`);

    const unsubscribe = onValue(
      roundRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          subscriber.next(null);
          return;
        }

        subscriber.next(snapshot.val());
      },
      (error) => {
        subscriber.error(error);
      }
    );

    return () => {
      unsubscribe();
    };
  });
}

export const { db, app } = connectToDatabase({
  apiKey: "AIzaSyBS4y25o2AFvS2BSRXUWwUrhtFRMrFK1XU",
  authDomain: "rock-talk-by-media-lab.firebaseapp.com",
  projectId: "rock-talk-by-media-lab",
  storageBucket: "rock-talk-by-media-lab.firebasestorage.app",
  messagingSenderId: "902150219310",
  appId: "1:902150219310:web:d716cc3d2861fbd398a1bf",
});
