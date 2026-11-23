import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createUserStore } from './user-store.js';

export function createFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
  const app = initializeApp({ credential: applicationDefault(), projectId });
  return { identity: getAuth(app), store: createUserStore(getFirestore(app)) };
}
