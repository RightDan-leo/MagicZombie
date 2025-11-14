import Database from 'better-sqlite3'
import type {
  TelemetryPayload,
  TelemetryRunStatus,
  WeaponProgressSnapshotMap,
  WeaponEnhancementSnapshot,
  KillBreakdownSnapshot,
  TelemetryProgressSample,
  TelemetryPlayerStateSnapshot,
} from '../shared/telemetry.js'
import { appConfig } from './config.js'

interface DbRunRow {
  id: string
  player_id: string
  stage_id: number
  stage_name: string
  target_score: number
  score: number
  status: TelemetryRunStatus
  elapsed_seconds: number
  selected_weapon: string
  weapon_progress_json: string
  weapon_enhancements_json: string
  kills_json: string
  player_state_json: string
  progress_samples_json: string
  started_at: number
  updated_at: number
}

export interface RunRecord {
  id: string
  playerId: string
  stageId: number
  stageName: string
  targetScore: number
  score: number
  status: TelemetryRunStatus
  elapsedSeconds: number
  selectedWeapon: string
  weaponProgress: WeaponProgressSnapshotMap
  weaponEnhancements: WeaponEnhancementSnapshot
  kills: KillBreakdownSnapshot
  playerState: TelemetryPlayerStateSnapshot
  progressSamples: TelemetryProgressSample[]
  startedAt: number
  updatedAt: number
}

export interface PlayerSummary {
  playerId: string
  totalRuns: number
  totalPlaySeconds: number
  lastSeenAt: number
  latestRun?: {
    runId: string
    stageId: number
    stageName: string
    status: TelemetryRunStatus
    score: number
    targetScore: number
    selectedWeapon: string
    elapsedSeconds: number
  }
}

const db = new Database(appConfig.dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    stage_id INTEGER NOT NULL,
    stage_name TEXT NOT NULL,
    target_score INTEGER NOT NULL,
    score INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'cleared', 'failed')),
    elapsed_seconds REAL NOT NULL,
    selected_weapon TEXT NOT NULL,
    weapon_progress_json TEXT NOT NULL,
    weapon_enhancements_json TEXT NOT NULL,
    kills_json TEXT NOT NULL,
    player_state_json TEXT NOT NULL,
    progress_samples_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_runs_player_updated ON runs(player_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_runs_updated ON runs(updated_at);
`)

const upsertRunStatement = db.prepare(`
  INSERT INTO runs (
    id,
    player_id,
    stage_id,
    stage_name,
    target_score,
    score,
    status,
    elapsed_seconds,
    selected_weapon,
    weapon_progress_json,
    weapon_enhancements_json,
    kills_json,
    player_state_json,
    progress_samples_json,
    started_at,
    updated_at
  ) VALUES (
    @id,
    @player_id,
    @stage_id,
    @stage_name,
    @target_score,
    @score,
    @status,
    @elapsed_seconds,
    @selected_weapon,
    @weapon_progress_json,
    @weapon_enhancements_json,
    @kills_json,
    @player_state_json,
    @progress_samples_json,
    @started_at,
    @updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    player_id = excluded.player_id,
    stage_id = excluded.stage_id,
    stage_name = excluded.stage_name,
    target_score = excluded.target_score,
    score = excluded.score,
    status = excluded.status,
    elapsed_seconds = excluded.elapsed_seconds,
    selected_weapon = excluded.selected_weapon,
    weapon_progress_json = excluded.weapon_progress_json,
    weapon_enhancements_json = excluded.weapon_enhancements_json,
    kills_json = excluded.kills_json,
    player_state_json = excluded.player_state_json,
    progress_samples_json = excluded.progress_samples_json,
    started_at = excluded.started_at,
    updated_at = excluded.updated_at
`)

const selectRunStatement = db.prepare<unknown[], DbRunRow>('SELECT * FROM runs WHERE id = ?')
const listRunsStatement = db.prepare<unknown[], DbRunRow>('SELECT * FROM runs ORDER BY updated_at DESC LIMIT ?')
const runsByPlayerStatement = db.prepare<unknown[], DbRunRow>(
  'SELECT * FROM runs WHERE player_id = ? ORDER BY updated_at DESC LIMIT ?',
)

const playerSummaryStatement = db.prepare<unknown[], PlayerSummaryRow>(`
  WITH stats AS (
    SELECT
      player_id,
      COUNT(*) AS total_runs,
      COALESCE(SUM(CASE WHEN status != 'in_progress' THEN elapsed_seconds ELSE 0 END), 0) AS total_play_seconds,
      MAX(updated_at) AS last_seen_at
    FROM runs
    GROUP BY player_id
  ),
  latest AS (
    SELECT r.*
    FROM runs r
    JOIN (
      SELECT player_id, MAX(updated_at) AS max_updated
      FROM runs
      GROUP BY player_id
    ) grouped ON grouped.player_id = r.player_id AND grouped.max_updated = r.updated_at
  )
  SELECT
    stats.player_id,
    stats.total_runs,
    stats.total_play_seconds,
    stats.last_seen_at,
    latest.id AS run_id,
    latest.stage_id,
    latest.stage_name,
    latest.status,
    latest.score,
    latest.target_score,
    latest.selected_weapon,
    latest.elapsed_seconds
  FROM stats
  LEFT JOIN latest ON latest.player_id = stats.player_id
  ORDER BY stats.last_seen_at DESC
`)

export function saveRun(payload: TelemetryPayload): RunRecord {
  const row = serializePayload(payload)
  upsertRunStatement.run(row)
  const stored = selectRunStatement.get(row.id)
  if (!stored) {
    throw new Error('Failed to persist telemetry run')
  }
  return mapRunRecord(stored)
}

export function getRun(runId: string): RunRecord | null {
  const row = selectRunStatement.get(runId)
  return row ? mapRunRecord(row) : null
}

export function listRecentRuns(limit = 50): RunRecord[] {
  return listRunsStatement
    .all(Math.max(1, Math.min(500, limit)))
    .map((row: DbRunRow) => mapRunRecord(row))
}

export function listRunsForPlayer(playerId: string, limit = 50): RunRecord[] {
  return runsByPlayerStatement
    .all(playerId, Math.max(1, Math.min(200, limit)))
    .map((row: DbRunRow) => mapRunRecord(row))
}

export function listPlayerSummaries(): PlayerSummary[] {
  return playerSummaryStatement.all().map((row: PlayerSummaryRow) => {
    const summary: PlayerSummary = {
      playerId: row.player_id,
      totalRuns: row.total_runs,
      totalPlaySeconds: Number(row.total_play_seconds ?? 0),
      lastSeenAt: row.last_seen_at,
    }

    if (row.run_id) {
      summary.latestRun = {
        runId: row.run_id,
        stageId: row.stage_id ?? 0,
        stageName: row.stage_name ?? 'Unknown',
        status: row.status ?? 'in_progress',
        score: row.score ?? 0,
        targetScore: row.target_score ?? 0,
        selectedWeapon: row.selected_weapon ?? 'unknown',
        elapsedSeconds: row.elapsed_seconds ?? 0,
      }
    }

    return summary
  })
}

function serializePayload(payload: TelemetryPayload) {
  return {
    id: payload.runId,
    player_id: payload.playerId,
    stage_id: payload.stageId,
    stage_name: payload.stageName,
    target_score: payload.targetScore,
    score: payload.score,
    status: payload.status,
    elapsed_seconds: payload.elapsedSeconds,
    selected_weapon: payload.selectedWeapon,
    weapon_progress_json: JSON.stringify(payload.weaponProgress ?? {}),
    weapon_enhancements_json: JSON.stringify(payload.weaponEnhancements ?? {}),
    kills_json: JSON.stringify(payload.kills ?? {}),
    player_state_json: JSON.stringify(payload.playerState),
    progress_samples_json: JSON.stringify(payload.progressSamples ?? []),
    started_at: payload.startedAt,
    updated_at: payload.updatedAt,
  }
}

function mapRunRecord(row: DbRunRow): RunRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    stageId: row.stage_id,
    stageName: row.stage_name,
    targetScore: row.target_score,
    score: row.score,
    status: row.status,
    elapsedSeconds: row.elapsed_seconds,
    selectedWeapon: row.selected_weapon,
    weaponProgress: safeParseJson<WeaponProgressSnapshotMap>(row.weapon_progress_json, {} as WeaponProgressSnapshotMap),
    weaponEnhancements: safeParseJson<WeaponEnhancementSnapshot>(row.weapon_enhancements_json, {} as WeaponEnhancementSnapshot),
    kills: safeParseJson<KillBreakdownSnapshot>(row.kills_json, {} as KillBreakdownSnapshot),
    playerState: safeParseJson<TelemetryPlayerStateSnapshot>(
      row.player_state_json,
      {
        maxHp: 0,
        hp: 0,
        speed: 0,
        level: 0,
        exp: 0,
        nextExp: 0,
        alive: false,
      } satisfies TelemetryPlayerStateSnapshot,
    ),
    progressSamples: safeParseJson<TelemetryProgressSample[]>(row.progress_samples_json, [] as TelemetryProgressSample[]),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  }
}

function safeParseJson<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T
  } catch {
    return fallback
  }
}
interface PlayerSummaryRow {
  player_id: string
  total_runs: number
  total_play_seconds: number
  last_seen_at: number
  run_id: string | null
  stage_id: number | null
  stage_name: string | null
  status: TelemetryRunStatus | null
  score: number | null
  target_score: number | null
  selected_weapon: string | null
  elapsed_seconds: number | null
}
