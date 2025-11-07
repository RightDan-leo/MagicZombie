import { EnemyDefinitions } from '../data/enemies'
import type { EnemyId, StageDefinition, StageSpawnRule } from '../data/types'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function getSpawnInterval(stage: StageDefinition, score: number) {
  if (stage.targetScore <= 0) {
    return stage.minSpawnInterval
  }

  const progress = clamp(score / stage.targetScore, 0, 1)
  const delta = stage.minSpawnInterval - stage.baseSpawnInterval
  return stage.baseSpawnInterval + delta * progress
}

export function getAvailableSpawnEntries(stage: StageDefinition, existingEnemyIds: EnemyId[]) {
  const rabbitExists = existingEnemyIds.includes('rewardRabbit')

  return stage.spawnTable.filter((entry) => {
    const definition = EnemyDefinitions[entry.enemyId]
    if (!definition) {
      return false
    }

    if (entry.enemyId === 'rewardRabbit' && rabbitExists) {
      return false
    }

    return definition.unlockStage <= stage.id
  })
}

export type RandomFloatFn = (max: number) => number

export function pickEnemyId(
  stage: StageDefinition,
  existingEnemyIds: EnemyId[],
  randomFloat: RandomFloatFn,
): EnemyId | undefined {
  const available = getAvailableSpawnEntries(stage, existingEnemyIds)

  if (available.length === 0) {
    return stage.spawnTable[0]?.enemyId
  }

  const totalWeight = available.reduce((acc, entry) => acc + Math.max(entry.weight, 0), 0)
  if (totalWeight <= 0) {
    return available[0].enemyId
  }

  let roll = randomFloat(totalWeight)

  for (const entry of available) {
    roll -= entry.weight
    if (roll <= 0) {
      return entry.enemyId
    }
  }

  return available[available.length - 1].enemyId
}

export type RandomIntFn = (min: number, max: number) => number

export function resolveBatchCount(
  enemyId: EnemyId,
  rule: StageSpawnRule | undefined,
  existingEnemyIds: EnemyId[],
  randomInt: RandomIntFn,
): number {
  if (!rule) {
    return 0
  }

  if (enemyId === 'rewardRabbit') {
    return existingEnemyIds.includes('rewardRabbit') ? 0 : 1
  }

  const min = Math.max(1, rule.minBatch)
  const max = Math.max(min, rule.maxBatch)
  return randomInt(min, max)
}

