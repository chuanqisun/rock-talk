import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { BehaviorSubject } from "rxjs";
import { app } from "../database/database";

const provider = new GoogleAuthProvider();
export const auth = getAuth(app);

export async function signin() {
  signInWithPopup(auth, provider)
    .then((result) => {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential) return;
      const token = credential.accessToken;
      if (!token) return;

      const user = result.user;
      console.log("User signed in:", user);
      console.log({ user, token });
      return user;
    })
    .catch((error) => {});
}

export function signout() {
  return auth.signOut().then(() => {
    console.log("User signed out");
  });
}

export function useUser() {
  const user$ = new BehaviorSubject<User | null | undefined>(undefined);

  onAuthStateChanged(auth, (user) => {
    if (user) {
      user$.next(user);
    } else {
      console.log("Auth state changed - no user signed in");
      user$.next(null);
    }
  });

  return user$;
}
