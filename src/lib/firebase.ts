import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function signInWithGooglePopup(): Promise<string> {
  const result = await signInWithPopup(auth, googleAuthProvider);
  return result.user.getIdToken();
}

export async function signOutFirebase(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch {
    // Ignore if not signed into Firebase
  }
}

export async function syncFirebasePlayerProfile(username: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;
  const lower = username.toLowerCase();

  try {
    await runTransaction(db, async (tx) => {
      const playerRef = doc(db, 'players', uid);
      const privateRef = doc(db, 'players', uid, 'private', 'info');
      const usernameRef = doc(db, 'usernames', lower);

      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists()) {
        const usernameSnap = await tx.get(usernameRef);
        if (!usernameSnap.exists()) {
          tx.set(usernameRef, {
            ownerUid: uid,
            username,
            createdAt: serverTimestamp(),
          });
        }
        tx.set(playerRef, {
          userId: uid,
          username,
          balance: 0,
          totalWagered: 0,
          totalWon: 0,
          winsCount: 0,
          gamesPlayed: 0,
          isBanned: false,
          role: 'player',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.set(privateRef, {
          userId: uid,
          email: user.email || 'unknown@example.com',
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `players/${uid}`);
  }
}
