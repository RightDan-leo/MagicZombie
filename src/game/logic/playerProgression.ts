import type { PlayerState } from '../types/player'

export interface PlayerProgressState {
  maxHp: number
  hp: number
  level: number
  exp: number
  nextExp: number
}

export interface ApplyExperienceResult<T extends PlayerProgressState> {
  state: T
  levelsGained: number
}

const BASE_EXP_REQUIREMENT = 80
const EXP_INCREMENT_PER_LEVEL = 40
const LEVEL_UP_HP_BONUS = 5
const INITIAL_PLAYER_MAX_HP = 100
const INITIAL_PLAYER_SPEED = 220

const INITIAL_PLAYER_STATE: PlayerState = {
  maxHp: INITIAL_PLAYER_MAX_HP,
  hp: INITIAL_PLAYER_MAX_HP,
  speed: INITIAL_PLAYER_SPEED,
  level: 1,
  exp: 0,
  nextExp: BASE_EXP_REQUIREMENT,
  alive: true,
}

export function createInitialPlayerState(): PlayerState {
  return { ...INITIAL_PLAYER_STATE }
}

export function getNextExpRequirement(level: number) {
  return BASE_EXP_REQUIREMENT + Math.max(0, level - 1) * EXP_INCREMENT_PER_LEVEL
}

export function applyExperience<T extends PlayerProgressState>(state: T, amount: number): ApplyExperienceResult<T> {
  const nextState = { ...state } as T
  let levelsGained = 0

  nextState.exp = Math.max(0, nextState.exp + amount)

  while (nextState.exp >= nextState.nextExp) {
    nextState.exp -= nextState.nextExp
    nextState.level += 1
    levelsGained += 1

    nextState.maxHp += LEVEL_UP_HP_BONUS
    nextState.hp = Math.min(nextState.maxHp, nextState.hp + LEVEL_UP_HP_BONUS)
    nextState.nextExp = getNextExpRequirement(nextState.level)
  }

  return { state: nextState, levelsGained }
}

export function applyExperienceInPlace<T extends PlayerState>(state: T, amount: number) {
  const { state: updated, levelsGained } = applyExperience(state, amount)
  Object.assign(state, updated)
  return { state, levelsGained }
}

export function applyDamage<T extends PlayerProgressState>(state: T, amount: number) {
  const nextState = { ...state } as T
  nextState.hp = Math.max(0, nextState.hp - amount)
  return nextState
}

