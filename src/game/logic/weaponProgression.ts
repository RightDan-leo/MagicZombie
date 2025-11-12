import type { EnemyId, WeaponId } from '../data/types'
import { EnemyDefinitions } from '../data/enemies'

export interface WeaponProgressState {
  level: number
  exp: number
}

export type WeaponProgressMap = Record<WeaponId, WeaponProgressState>

const EXP_THRESHOLDS = [30, 60, 90, 120, 160, 210, 280]
const MAX_LEVEL = EXP_THRESHOLDS.length + 1
const BASE_EXP = 5

export function createInitialWeaponProgress(weaponIds: WeaponId[]): WeaponProgressMap {
  return weaponIds.reduce<WeaponProgressMap>((acc, id) => {
    acc[id] = { level: 1, exp: 0 }
    return acc
  }, {} as WeaponProgressMap)
}

export function addWeaponExperience(progress: WeaponProgressMap, weaponId: WeaponId, amount: number) {
  const entry = progress[weaponId]
  if (!entry || entry.level >= MAX_LEVEL || amount <= 0) {
    return 0
  }

  entry.exp += amount
  let levelsGained = 0

  while (entry.level < MAX_LEVEL) {
    const threshold = EXP_THRESHOLDS[entry.level - 1]
    if (entry.exp < threshold) {
      break
    }
    entry.exp -= threshold
    entry.level += 1
    levelsGained += 1
  }

  if (entry.level >= MAX_LEVEL) {
    entry.level = MAX_LEVEL
    entry.exp = EXP_THRESHOLDS[MAX_LEVEL - 2]
  }

  return levelsGained
}

export function getWeaponProgressSummary(progress: WeaponProgressMap, weaponId: WeaponId) {
  const entry = progress[weaponId]
  if (!entry) {
    return { level: 1, exp: 0, next: EXP_THRESHOLDS[0], max: false }
  }
  const max = entry.level >= MAX_LEVEL
  const nextRequirement = max ? 0 : EXP_THRESHOLDS[entry.level - 1]
  return {
    level: entry.level,
    exp: max ? nextRequirement : entry.exp,
    next: nextRequirement,
    max,
  }
}

export function calculateWeaponExpGain(enemyId: EnemyId) {
  const definition = EnemyDefinitions[enemyId]
  const multiplier = definition.weaponExpMultiplier ?? 1
  return Math.round(BASE_EXP * multiplier)
}
