import { persistProgress } from './api'
import { getSession, updateSessionProgress } from './sessionStore'
import type { SavedProgress } from './types'

let pendingProgress: SavedProgress | null = null
let flushTimer: number | undefined

function cloneProgress(progress: SavedProgress): SavedProgress {
  return {
    ...progress,
    playerState: { ...progress.playerState },
  }
}

async function flushProgress() {
  if (!pendingProgress) {
    return
  }

  const session = getSession()
  if (!session) {
    pendingProgress = null
    return
  }

  const progressToSave = pendingProgress
  pendingProgress = null

  try {
    const result = await persistProgress(session.username, progressToSave)
    updateSessionProgress(result.progress ?? progressToSave)
  } catch (error) {
    console.error('Failed to save progress', error)
  }
}

export function queueProgressSave(progress: Omit<SavedProgress, 'updatedAt'>, options?: { immediate?: boolean }) {
  if (typeof window === 'undefined') {
    return
  }

  const timestamp = new Date().toISOString()
  const payload: SavedProgress = cloneProgress({ ...progress, updatedAt: timestamp })
  pendingProgress = payload

  if (options?.immediate) {
    if (flushTimer) {
      window.clearTimeout(flushTimer)
      flushTimer = undefined
    }
    void flushProgress()
    return
  }

  if (flushTimer) {
    return
  }

  flushTimer = window.setTimeout(() => {
    flushTimer = undefined
    void flushProgress()
  }, 800)
}
