import type { SavedProgress, UserSession } from './types'

let session: UserSession | null = null

export function setSession(next: UserSession) {
  session = next
}

export function getSession() {
  return session
}

export function updateSessionProgress(progress: SavedProgress | null) {
  if (!session) {
    return
  }

  session = { ...session, progress }
}
