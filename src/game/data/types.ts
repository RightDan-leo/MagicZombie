export type WeaponId = 'lightningChain' | 'flamethrower' | 'waterCannon'

export type EnemyId =
  | 'zombieSmall'
  | 'zombieDog'
  | 'zombieMedium'
  | 'zombieBear'
  | 'zombieLarge'
  | 'rewardRabbit'

export interface WeaponDefinition {
  id: WeaponId
  label: string
  baseDamage: number
  attacksPerSecond: number
  range: number
  projectileSpeed?: number
  chainTargets?: number
  penetration?: number
  notes?: string
}

export interface EnemyDefinition {
  id: EnemyId
  label: string
  category: 'common' | 'elite' | 'boss' | 'reward'
  maxHp: number
  moveSpeed: number
  attackDamage: number
  experience: number
  score: number
  unlockStage: number
  aiBehavior: 'chaser' | 'pouncer' | 'tank' | 'boss' | 'evader'
  weaponExpMultiplier?: number
}

export interface StageSpawnRule {
  enemyId: EnemyId
  weight: number
  minBatch: number
  maxBatch: number
}

export interface StageDefinition {
  id: number
  name: string
  backgroundKey: string
  targetScore: number
  recommendedDuration: number
  baseSpawnInterval: number
  minSpawnInterval: number
  spawnTable: StageSpawnRule[]
}

