import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'

const env = (import.meta as ImportMeta | undefined)?.env ?? ({} as ImportMetaEnv)

const config: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
}

const firebaseEnabled = Boolean(config.apiKey && config.authDomain && config.projectId)

let firestore: Firestore | null = null

export function isFirebaseEnabled() {
  return firebaseEnabled
}

export function getFirestoreDb(): Firestore {
  if (!firebaseEnabled) {
    throw new Error('Firebase is not configured. Set VITE_FIREBASE_* environment variables.')
  }
  if (!firestore) {
    const app = initializeApp(config)
    firestore = getFirestore(app)
  }
  return firestore
}
