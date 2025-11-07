import type { PlayerState } from '../game/types/player'
import type { WeaponId } from '../game/data/types'

export interface SavedProgress {
  stageIndex: number
  score: number
  equippedWeapon: WeaponId
  playerState: PlayerState
  updatedAt: string
}

export interface UserSession {
  username: string
  progress: SavedProgress | null
}
