export type TelemetryRunStatus = 'in_progress' | 'cleared' | 'failed'

export interface TelemetryPlayerStateSnapshot {
  maxHp: number
  hp: number
  speed: number
  level: number
  exp: number
  nextExp: number
  alive: boolean
}

export interface WeaponProgressSnapshot {
  level: number
  exp: number
  next: number
  max: boolean
}

export type WeaponProgressSnapshotMap<TWeapon extends string = string> = Partial<Record<TWeapon, WeaponProgressSnapshot>>

export type WeaponEnhancementSnapshot<TWeapon extends string = string> = Partial<Record<TWeapon, Record<string, number>>>

export type KillBreakdownSnapshot<TEnemy extends string = string> = Partial<Record<TEnemy, number>>

export interface TelemetryProgressSample {
  timestamp: number
  score: number
  elapsedSeconds: number
}

export interface TelemetryPayload<
  TWeapon extends string = string,
  TEnemy extends string = string,
> {
  runId: string
  playerId: string
  stageId: number
  stageName: string
  targetScore: number
  score: number
  status: TelemetryRunStatus
  elapsedSeconds: number
  selectedWeapon: TWeapon
  weaponProgress: WeaponProgressSnapshotMap<TWeapon>
  weaponEnhancements: WeaponEnhancementSnapshot<TWeapon>
  kills: KillBreakdownSnapshot<TEnemy>
  playerState: TelemetryPlayerStateSnapshot
  progressSamples: TelemetryProgressSample[]
  startedAt: number
  updatedAt: number
}
