import type { PlayerState } from '../game/types/player'
import { fetchProfile, persistProfile, type PlayerProfileRecord } from '../services/profileStorage'

export interface ProfileSnapshot {
  stageIndex: number
  score: number
  playerState: PlayerState
}

const SAVE_DEBOUNCE_MS = 4000

class ProfileManager {
  private profile: PlayerProfileRecord | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private isSaving = false

  async bootstrap(profileId: string) {
    this.profile = await fetchProfile(profileId)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        void this.flush()
      })
    }
    return this.profile
  }

  getProfile() {
    return this.profile
  }

  updateSnapshot(snapshot: ProfileSnapshot) {
    if (!this.profile) {
      return
    }

    const nextStage = Math.max(this.profile.stageIndex, Math.floor(snapshot.stageIndex))
    const nextBestScore = Math.max(this.profile.bestScore, Math.floor(snapshot.score))
    this.profile = {
      ...this.profile,
      stageIndex: nextStage,
      bestScore: nextBestScore,
      playerState: clonePlayerState(snapshot.playerState),
      updatedAt: Date.now(),
    }

    this.scheduleSave()
  }

  private scheduleSave() {
    if (this.saveTimer) {
      return
    }
    this.saveTimer = setTimeout(() => {
      void this.flush()
    }, SAVE_DEBOUNCE_MS)
  }

  async flush() {
    if (!this.profile || this.isSaving) {
      return
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    try {
      this.isSaving = true
      await persistProfile(this.profile)
    } catch (error) {
      console.warn('Failed to persist profile', error)
    } finally {
      this.isSaving = false
    }
  }
}

export const profileManager = new ProfileManager()
function clonePlayerState(state: PlayerState): PlayerState {
  return {
    maxHp: state.maxHp,
    hp: state.hp,
    speed: state.speed,
    level: state.level,
    exp: state.exp,
    nextExp: state.nextExp,
    alive: state.alive,
  }
}
