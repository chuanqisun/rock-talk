import { initializeApp } from "firebase/app";
import { Database, get, getDatabase, onValue, push, ref, remove, set } from "firebase/database";
import { Observable } from "rxjs";
import { defaultMeditationPrompt } from "../prompts/meditation-prompts";

// Data models based on system-design.md
export interface DbRound {
  id?: string;
  topic: string;
  synthesis: string;
  createdAt: string;
  sessions?: DbSession[];
  themes?: string[];
}

export interface DbRock {
  id?: string;
  systemPrompt: string;
  name: string;
  createdAt: string;
  sessions?: DbSession[];
}

export interface DbSession {
  id?: string;
  roundId: string;
  rockId: string;
  createdAt: string;
  memory: string[];
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
  const app = initializeApp(config);
  const db = getDatabase(app);
  return { app, db };
}

// --- Rock operations ---

export interface DbRockWithId extends DbRock {
  id: string;
}

export function observeRocks(db: Database): Observable<DbRockWithId[]> {
  return new Observable((subscriber) => {
    const rocksRef = ref(db, "rocks");

    const unsubscribe = onValue(
      rocksRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          subscriber.next([]);
          return;
        }

        const rocksData = snapshot.val();
        const rocks: DbRockWithId[] = [];

        for (const [rockId, rockData] of Object.entries(rocksData as Record<string, DbRock>)) {
          rocks.push({
            id: rockId,
            name: rockData.name,
            systemPrompt: rockData.systemPrompt,
            createdAt: rockData.createdAt,
            sessions: rockData.sessions ? Object.values(rockData.sessions) : [],
          });
        }

        // Sort by createdAt descending (newest first)
        rocks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        subscriber.next(rocks);
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

export async function createRock(db: Database, name: string): Promise<string> {
  const rocksRef = ref(db, "rocks");
  const newRockRef = push(rocksRef);

  const rock: DbRock = {
    name,
    systemPrompt: defaultMeditationPrompt(""),
    createdAt: new Date().toISOString(),
    sessions: [],
  };

  await set(newRockRef, rock);
  return newRockRef.key!;
}

export async function updateRock(db: Database, rockId: string, updates: Partial<DbRock>): Promise<void> {
  const rockRef = ref(db, `rocks/${rockId}`);
  const snapshot = await get(rockRef);
  if (snapshot.exists()) {
    const rock = snapshot.val();
    await set(rockRef, { ...rock, ...updates });
  }
}

export async function deleteRock(db: Database, rockId: string): Promise<void> {
  const rockRef = ref(db, `rocks/${rockId}`);
  await remove(rockRef);
}

export async function getRock(db: Database, rockId: string): Promise<DbRock | null> {
  const rockRef = ref(db, `rocks/${rockId}`);
  const snapshot = await get(rockRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val();
}

// --- Round operations ---

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

        for (const [roundId, roundData] of Object.entries(roundsData as Record<string, DbRound>)) {
          rounds.push({
            id: roundId,
            topic: roundData.topic,
            synthesis: roundData.synthesis,
            createdAt: roundData.createdAt,
            sessions: roundData.sessions ? Object.values(roundData.sessions) : [],
            themes: roundData.themes || [],
          });
        }

        // Sort by createdAt descending (newest first)
        rounds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

export async function createRound(db: Database, topic: string): Promise<string> {
  const roundsRef = ref(db, "rounds");
  const newRoundRef = push(roundsRef);

  const round: DbRound = {
    topic,
    synthesis: "",
    createdAt: new Date().toISOString(),
    sessions: [],
    themes: [],
  };

  await set(newRoundRef, round);
  return newRoundRef.key!;
}

export async function updateRound(db: Database, roundId: string, updates: Partial<DbRound>): Promise<void> {
  const roundRef = ref(db, `rounds/${roundId}`);
  const snapshot = await get(roundRef);
  if (snapshot.exists()) {
    const round = snapshot.val();
    await set(roundRef, { ...round, ...updates });
  }
}

export async function deleteRound(db: Database, roundId: string): Promise<void> {
  const roundRef = ref(db, `rounds/${roundId}`);
  await remove(roundRef);
}

export async function getRound(db: Database, roundId: string): Promise<DbRound | null> {
  const roundRef = ref(db, `rounds/${roundId}`);
  const snapshot = await get(roundRef);
  if (!snapshot.exists()) {
    return null;
  }
  const roundData = snapshot.val();
  return {
    ...roundData,
    sessions: roundData.sessions ? Object.values(roundData.sessions) : [],
    themes: roundData.themes || [],
  };
}

// --- Session operations ---

export async function uploadSession(db: Database, roundId: string, rockId: string, memory: string[]): Promise<string> {
  const sessionsRef = ref(db, `sessions`);
  const newSessionRef = push(sessionsRef);

  const session: DbSession = {
    roundId,
    rockId,
    createdAt: new Date().toISOString(),
    memory,
  };

  await set(newSessionRef, session);

  // Also add session reference to the round
  const roundSessionsRef = ref(db, `rounds/${roundId}/sessions`);
  const roundNewSessionRef = push(roundSessionsRef);
  await set(roundNewSessionRef, session);

  // Also add session reference to the rock
  const rockSessionsRef = ref(db, `rocks/${rockId}/sessions`);
  const rockNewSessionRef = push(rockSessionsRef);
  await set(rockNewSessionRef, session);

  return newSessionRef.key!;
}

export async function deleteSessionFromRound(db: Database, roundId: string, sessionKey: string): Promise<void> {
  const sessionRef = ref(db, `rounds/${roundId}/sessions/${sessionKey}`);
  await remove(sessionRef);
}

export async function deleteSessionFromRock(db: Database, rockId: string, sessionKey: string): Promise<void> {
  const sessionRef = ref(db, `rocks/${rockId}/sessions/${sessionKey}`);
  await remove(sessionRef);
}

export function observeSessionsForRound(db: Database, roundId: string): Observable<DbSession[]> {
  return new Observable((subscriber) => {
    const sessionsRef = ref(db, `rounds/${roundId}/sessions`);

    const unsubscribe = onValue(
      sessionsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          subscriber.next([]);
          return;
        }

        const sessionsData = snapshot.val();
        const sessions: DbSession[] = Object.values(sessionsData);

        // Sort by createdAt descending (newest first)
        sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        subscriber.next(sessions);
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

export function observeSessionsForRock(db: Database, rockId: string): Observable<DbSession[]> {
  return new Observable((subscriber) => {
    const sessionsRef = ref(db, `rocks/${rockId}/sessions`);

    const unsubscribe = onValue(
      sessionsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          subscriber.next([]);
          return;
        }

        const sessionsData = snapshot.val();
        const sessions: DbSession[] = Object.values(sessionsData);

        // Sort by createdAt descending (newest first)
        sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        subscriber.next(sessions);
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

// Fetch rock config (system prompt) for user session
export async function fetchRockConfig(rockId: string): Promise<string> {
  const rockRef = ref(db, `rocks/${rockId}/systemPrompt`);
  const snapshot = await get(rockRef);
  if (snapshot.exists()) {
    return snapshot.val() || "";
  }
  return "";
}

// Firebase configuration - using same project as firebase-poc
export const { db, app } = connectToDatabase({
  apiKey: "AIzaSyBS4y25o2AFvS2BSRXUWwUrhtFRMrFK1XU",
  authDomain: "rock-talk-by-media-lab.firebaseapp.com",
  projectId: "rock-talk-by-media-lab",
  storageBucket: "rock-talk-by-media-lab.firebasestorage.app",
  messagingSenderId: "902150219310",
  appId: "1:902150219310:web:d716cc3d2861fbd398a1bf",
});
