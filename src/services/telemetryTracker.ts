import type { StageDefinition, WeaponId, EnemyId } from '../game/data/types'
import type { WeaponProgressMap } from '../game/logic/weaponProgression'
import { getWeaponProgressSummary } from '../game/logic/weaponProgression'
import type { PlayerState } from '../game/types/player'
import type {
  TelemetryPayload,
  TelemetryRunStatus,
  TelemetryProgressSample,
  WeaponProgressSnapshotMap,
  WeaponEnhancementSnapshot,
  KillBreakdownSnapshot,
} from '../../shared/telemetry'
import type { WeaponEnhancementId } from '../game/data/weaponEnhancements'

const metaEnv =
  typeof import.meta === 'object' && import.meta?.env ? import.meta.env : ({} as Record<string, string | undefined>)
const API_BASE_URL = (metaEnv.VITE_TELEMETRY_API_URL ?? '').replace(/\/$/, '')
const API_TOKEN = metaEnv.VITE_TELEMETRY_TOKEN ?? ''

const TELEMETRY_ENABLED = Boolean(API_BASE_URL && API_TOKEN)
const MAX_PROGRESS_SAMPLES = 120
const SAMPLE_INTERVAL_MS = 1500
const MIN_PUSH_INTERVAL_MS = 5000

type WeaponEnhancementState = Partial<Record<WeaponEnhancementId, number>>

interface SnapshotPayload {
  score: number
  elapsedSeconds: number
  playerState: PlayerState
  weaponProgress: WeaponProgressMap
  weaponEnhancements: Record<WeaponId, WeaponEnhancementState>
  selectedWeapon: WeaponId
}

export class TelemetryTracker {
  private runId: string | null = null
  private playerId: string | null = null
  private stage: StageDefinition | null = null
  private status: TelemetryRunStatus = 'in_progress'
  private targetScore = 0
  private startedAt = 0
  private score = 0
  private elapsedSeconds = 0
  private selectedWeapon: WeaponId = 'lightningChain'
  private kills: KillBreakdownSnapshot<EnemyId> = {}
  private samples: TelemetryProgressSample[] = []
  private lastSampleAt = 0
  private lastPushAt = 0
  private sending = false
  private pendingForce = false
  private loggedError = false
  private playerStateSnapshot: PlayerState | null = null
  private weaponProgressSnapshot: WeaponProgressSnapshotMap<WeaponId> = {}
  private weaponEnhancementsSnapshot: WeaponEnhancementSnapshot<WeaponId> = {}

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        void this.flush(true)
      })
    }
  }

  beginRun(context: { playerId: string | null; stage: StageDefinition; selectedWeapon: WeaponId }) {
    if (!TELEMETRY_ENABLED) {
      return
    }
    if (!context.playerId) {
      return
    }

    this.playerId = context.playerId
    this.stage = context.stage
    this.targetScore = context.stage.targetScore
    this.runId = this.generateRunId()
    this.status = 'in_progress'
    this.startedAt = Date.now()
    this.score = 0
    this.elapsedSeconds = 0
    this.selectedWeapon = context.selectedWeapon
    this.kills = {}
    this.samples = []
    this.lastSampleAt = 0
    this.lastPushAt = 0
    this.playerStateSnapshot = null
    this.weaponProgressSnapshot = {}
    this.weaponEnhancementsSnapshot = {}

    void this.flush(true)
  }

  recordKill(enemyId: EnemyId) {
    if (!this.runId) {
      return
    }
    this.kills[enemyId] = (this.kills[enemyId] ?? 0) + 1
    void this.scheduleFlush()
  }

  updateSnapshot(snapshot: SnapshotPayload) {
    if (!this.runId || !this.stage) {
      return
    }

    this.score = snapshot.score
    this.elapsedSeconds = snapshot.elapsedSeconds
    this.selectedWeapon = snapshot.selectedWeapon
    this.playerStateSnapshot = clonePlayerState(snapshot.playerState)
    this.weaponProgressSnapshot = buildWeaponSummary(snapshot.weaponProgress)
    this.weaponEnhancementsSnapshot = buildEnhancementSummary(snapshot.weaponEnhancements)

    this.maybeAddSample(snapshot.score, snapshot.elapsedSeconds)
    void this.scheduleFlush()
  }

  markCleared() {
    if (!this.runId) {
      return
    }
    this.status = 'cleared'
    void this.flush(true)
  }

  markFailed() {
    if (!this.runId) {
      return
    }
    this.status = 'failed'
    void this.flush(true)
  }

  private maybeAddSample(score: number, elapsedSeconds: number) {
    const now = Date.now()
    const lastEntry = this.samples[this.samples.length - 1]
    if (lastEntry) {
      const scoreChanged = lastEntry.score !== score
      const elapsedChanged = Math.abs(lastEntry.elapsedSeconds - elapsedSeconds) >= 0.5
      if (!scoreChanged && !elapsedChanged && now - this.lastSampleAt < SAMPLE_INTERVAL_MS) {
        return
      }
    }

    this.lastSampleAt = now
    this.samples.push({
      timestamp: now,
      score,
      elapsedSeconds,
    })

    if (this.samples.length > MAX_PROGRESS_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_PROGRESS_SAMPLES)
    }
  }

  private async scheduleFlush(force = false) {
    if (!this.runId || !this.stage) {
      return
    }
    const now = Date.now()
    if (!force && now - this.lastPushAt < MIN_PUSH_INTERVAL_MS) {
      return
    }
    await this.flush(force)
  }

  private async flush(force = false) {
    if (!TELEMETRY_ENABLED || !this.runId || !this.stage || !this.playerId || !this.playerStateSnapshot) {
      return
    }

    const now = Date.now()
    if (!force && now - this.lastPushAt < MIN_PUSH_INTERVAL_MS) {
      return
    }

    if (this.sending) {
      this.pendingForce = this.pendingForce || force
      return
    }

    const payload = this.buildPayload()
    this.sending = true
    try {
      await fetch(`${API_BASE_URL}/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      })
      this.lastPushAt = Date.now()
      this.loggedError = false
    } catch (error) {
      if (!this.loggedError) {
        console.warn('[telemetry] failed to push update', error)
        this.loggedError = true
      }
    } finally {
      this.sending = false
      if (this.pendingForce) {
        this.pendingForce = false
        void this.flush(true)
      }
    }
  }

  private buildPayload(): TelemetryPayload<WeaponId, EnemyId> {
    if (!this.runId || !this.stage || !this.playerId || !this.playerStateSnapshot) {
      throw new Error('Telemetry payload incomplete')
    }
    return {
      runId: this.runId,
      playerId: this.playerId,
      stageId: this.stage.id,
      stageName: this.stage.name,
      targetScore: this.targetScore,
      score: this.score,
      status: this.status,
      elapsedSeconds: this.elapsedSeconds,
      selectedWeapon: this.selectedWeapon,
      weaponProgress: this.weaponProgressSnapshot,
      weaponEnhancements: this.weaponEnhancementsSnapshot,
      kills: this.kills,
      playerState: sanitizePlayerState(this.playerStateSnapshot),
      progressSamples: [...this.samples],
      startedAt: this.startedAt,
      updatedAt: Date.now(),
    }
  }

  private generateRunId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    const random = Math.random().toString(16).slice(2, 10)
    return `run-${Date.now().toString(36)}-${random}`
  }
}

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

function sanitizePlayerState(state: PlayerState): PlayerState {
  return {
    maxHp: Math.max(0, Math.round(state.maxHp)),
    hp: Math.max(0, Math.round(state.hp)),
    speed: Math.max(0, Math.round(state.speed)),
    level: Math.max(1, Math.round(state.level)),
    exp: Math.max(0, Math.round(state.exp)),
    nextExp: Math.max(1, Math.round(state.nextExp)),
    alive: Boolean(state.alive),
  }
}

function buildWeaponSummary(progress: WeaponProgressMap): WeaponProgressSnapshotMap<WeaponId> {
  const entries: WeaponProgressSnapshotMap<WeaponId> = {}
  const weaponIds = Object.keys(progress) as WeaponId[]
  for (const weaponId of weaponIds) {
    const summary = getWeaponProgressSummary(progress, weaponId)
    entries[weaponId] = summary
  }
  return entries
}

function buildEnhancementSummary(input: Record<WeaponId, WeaponEnhancementState>): WeaponEnhancementSnapshot<WeaponId> {
  const result: WeaponEnhancementSnapshot<WeaponId> = {}
  for (const [weaponId, state] of Object.entries(input)) {
    if (!state) {
      continue
    }
    const pairs = Object.entries(state).filter(([, value]) => typeof value === 'number')
    if (!pairs.length) {
      continue
    }
    result[weaponId as WeaponId] = pairs.reduce<Record<string, number>>((acc, [key, value]) => {
      acc[key] = Number(value)
      return acc
    }, {})
  }
  return result
}

export const telemetryTracker = new TelemetryTracker()
