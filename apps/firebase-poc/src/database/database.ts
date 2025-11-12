import { initializeApp } from "firebase/app";
import { Database, get, getDatabase, onValue, push, ref, set } from "firebase/database";
import { Observable } from "rxjs";

export interface DbDevice {
  id: number;
  name: string;
  sessions: DbSession[];
}

export interface DbSession {
  createdAt: string;
  transcripts: DbTranscript[];
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
  const database = getDatabase(app);
  return database;
}

export async function listDevices(db: Database): Promise<DbDevice[]> {
  const devicesRef = ref(db, "devices");
  const snapshot = await get(devicesRef);

  if (!snapshot.exists()) {
    return [];
  }

  const devicesData = snapshot.val();
  const devices: DbDevice[] = [];

  for (const [deviceId, deviceData] of Object.entries(devicesData as Record<string, any>)) {
    const sessions: DbSession[] = [];

    if (deviceData.sessions) {
      for (const sessionData of Object.values(deviceData.sessions as Record<string, any>)) {
        sessions.push({
          createdAt: sessionData.createdAt,
          transcripts: sessionData.transcripts || [],
        });
      }
    }

    devices.push({
      id: parseInt(deviceId),
      name: deviceData.name || `Device ${deviceId}`,
      sessions,
    });
  }

  return devices;
}

export function observeDevices(db: Database): Observable<DbDevice[]> {
  return new Observable((subscriber) => {
    const devicesRef = ref(db, "devices");

    const unsubscribe = onValue(
      devicesRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          subscriber.next([]);
          return;
        }

        const devicesData = snapshot.val();
        const devices: DbDevice[] = [];

        for (const [deviceId, deviceData] of Object.entries(devicesData as Record<string, any>)) {
          const sessions: DbSession[] = [];

          if (deviceData.sessions) {
            for (const sessionData of Object.values(deviceData.sessions as Record<string, any>)) {
              sessions.push({
                createdAt: sessionData.createdAt,
                transcripts: sessionData.transcripts || [],
              });
            }
          }

          devices.push({
            id: parseInt(deviceId),
            name: deviceData.name || `Device ${deviceId}`,
            sessions,
          });
        }

        subscriber.next(devices);
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

export async function uploadSession(db: Database, deviceId: number, session: DbSession): Promise<void> {
  const sessionsRef = ref(db, `devices/${deviceId}/sessions`);
  const newSessionRef = push(sessionsRef);
  await set(newSessionRef, session);
}

export const db = connectToDatabase({
  apiKey: "AIzaSyBS4y25o2AFvS2BSRXUWwUrhtFRMrFK1XU",
  authDomain: "rock-talk-by-media-lab.firebaseapp.com",
  projectId: "rock-talk-by-media-lab",
  storageBucket: "rock-talk-by-media-lab.firebasestorage.app",
  messagingSenderId: "902150219310",
  appId: "1:902150219310:web:d716cc3d2861fbd398a1bf",
});
