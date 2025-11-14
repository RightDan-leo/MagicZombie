import { Router, type Request, type Response } from 'express'
import { z, type ZodType } from 'zod'
import { appConfig } from '../config.js'
import { saveRun } from '../db.js'
import type { TelemetryPayload } from '../../shared/telemetry.js'

const playerStateSchema = z.object({
  maxHp: z.number().nonnegative(),
  hp: z.number().nonnegative(),
  speed: z.number().nonnegative(),
  level: z.number().int().nonnegative(),
  exp: z.number().nonnegative(),
  nextExp: z.number().positive(),
  alive: z.boolean(),
})

const weaponProgressEntrySchema = z.object({
  level: z.number().int().positive(),
  exp: z.number().nonnegative(),
  next: z.number().nonnegative(),
  max: z.boolean(),
})

const progressSampleSchema = z.object({
  timestamp: z.number().nonnegative(),
  score: z.number().int().nonnegative(),
  elapsedSeconds: z.number().nonnegative(),
})

const weaponEnhancementSchema = z.record(z.string(), z.number())

const telemetrySchema: ZodType<TelemetryPayload> = z.object({
  runId: z.string().min(4),
  playerId: z.string().min(2),
  stageId: z.number().int().nonnegative(),
  stageName: z.string().min(1),
  targetScore: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  status: z.enum(['in_progress', 'cleared', 'failed']),
  elapsedSeconds: z.number().nonnegative(),
  selectedWeapon: z.string().min(1),
  weaponProgress: z.record(z.string(), weaponProgressEntrySchema).default({}),
  weaponEnhancements: z.record(z.string(), weaponEnhancementSchema).default({}),
  kills: z.record(z.string(), z.number().int().nonnegative()).default({}),
  playerState: playerStateSchema,
  progressSamples: z.array(progressSampleSchema).max(200).default([]),
  startedAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
})

export const telemetryRouter = Router()

telemetryRouter.post('/runs', (req: Request, res: Response) => {
  const token = extractBearer(req.get('authorization'))
  if (!token || token !== appConfig.telemetryIngestToken) {
    return res.status(401).json({ error: 'Invalid telemetry token' })
  }

  const parsed = telemetrySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() })
  }

  const record = saveRun(parsed.data)

  res.json({ ok: true, runId: record.id })
})

function extractBearer(header: string | undefined | null) {
  if (!header) {
    return null
  }
  const [type, token] = header.split(' ')
  if (type?.toLowerCase() !== 'bearer') {
    return null
  }
  return token?.trim() ?? null
}
