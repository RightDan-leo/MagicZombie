import type { StageDefinition } from './types'

export const StageDefinitions: StageDefinition[] = [
  {
    id: 1,
    name: '城区外围',
    targetScore: 5000,
    recommendedDuration: 180,
    baseSpawnInterval: 4500,
    minSpawnInterval: 3000,
    spawnTable: [
      { enemyId: 'zombieSmall', weight: 70, minBatch: 3, maxBatch: 6 },
      { enemyId: 'zombieDog', weight: 20, minBatch: 4, maxBatch: 7 },
      { enemyId: 'rewardRabbit', weight: 2, minBatch: 1, maxBatch: 1 },
    ],
  },
  {
    id: 2,
    name: '商场废墟',
    targetScore: 12000,
    recommendedDuration: 210,
    baseSpawnInterval: 4200,
    minSpawnInterval: 2600,
    spawnTable: [
      { enemyId: 'zombieSmall', weight: 55, minBatch: 4, maxBatch: 7 },
      { enemyId: 'zombieDog', weight: 15, minBatch: 3, maxBatch: 6 },
      { enemyId: 'zombieMedium', weight: 15, minBatch: 1, maxBatch: 3 },
      { enemyId: 'rewardRabbit', weight: 2, minBatch: 1, maxBatch: 1 },
    ],
  },
  {
    id: 3,
    name: '工业区管道',
    targetScore: 20000,
    recommendedDuration: 240,
    baseSpawnInterval: 4000,
    minSpawnInterval: 2400,
    spawnTable: [
      { enemyId: 'zombieSmall', weight: 50, minBatch: 4, maxBatch: 7 },
      { enemyId: 'zombieDog', weight: 15, minBatch: 4, maxBatch: 6 },
      { enemyId: 'zombieMedium', weight: 15, minBatch: 2, maxBatch: 3 },
      { enemyId: 'zombieBear', weight: 15, minBatch: 1, maxBatch: 2 },
      { enemyId: 'rewardRabbit', weight: 2, minBatch: 1, maxBatch: 1 },
    ],
  },
  {
    id: 4,
    name: '能源站外环',
    targetScore: 30000,
    recommendedDuration: 270,
    baseSpawnInterval: 3600,
    minSpawnInterval: 2200,
    spawnTable: [
      { enemyId: 'zombieSmall', weight: 50, minBatch: 5, maxBatch: 8 },
      { enemyId: 'zombieDog', weight: 20, minBatch: 5, maxBatch: 8 },
      { enemyId: 'zombieMedium', weight: 15, minBatch: 2, maxBatch: 4 },
      { enemyId: 'zombieBear', weight: 15, minBatch: 2, maxBatch: 3 },
      { enemyId: 'rewardRabbit', weight: 2, minBatch: 1, maxBatch: 1 },
    ],
  },
  {
    id: 5,
    name: '重灾区中心',
    targetScore: 45000,
    recommendedDuration: 300,
    baseSpawnInterval: 3400,
    minSpawnInterval: 2000,
    spawnTable: [
      { enemyId: 'zombieSmall', weight: 45, minBatch: 6, maxBatch: 9 },
      { enemyId: 'zombieDog', weight: 20, minBatch: 6, maxBatch: 9 },
      { enemyId: 'zombieMedium', weight: 15, minBatch: 3, maxBatch: 4 },
      { enemyId: 'zombieBear', weight: 10, minBatch: 2, maxBatch: 3 },
      { enemyId: 'zombieLarge', weight: 5, minBatch: 1, maxBatch: 1 },
      { enemyId: 'rewardRabbit', weight: 3, minBatch: 1, maxBatch: 1 },
    ],
  },
]

export function getStageDefinition(id: number): StageDefinition | undefined {
  return StageDefinitions.find((stage) => stage.id === id)
}

