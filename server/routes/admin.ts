import { Router, type Request, type Response } from 'express'
import { listPlayerSummaries, listRecentRuns, listRunsForPlayer, getRun } from '../db.js'
import { requireAuth } from '../middleware/requireAuth.js'

export const adminRouter = Router()

adminRouter.use(requireAuth)

adminRouter.get('/players', (_req: Request, res: Response) => {
  const players = listPlayerSummaries()
  res.json({ players })
})

adminRouter.get('/runs', (req: Request, res: Response) => {
  const limit = parseLimit(req.query.limit)
  const playerId = typeof req.query.playerId === 'string' ? req.query.playerId : null

  const runs = playerId ? listRunsForPlayer(playerId, limit) : listRecentRuns(limit)
  res.json({ runs })
})

adminRouter.get('/runs/:runId', (req: Request, res: Response) => {
  const run = getRun(req.params.runId)
  if (!run) {
    return res.status(404).json({ error: 'Run not found' })
  }
  res.json({ run })
})

function parseLimit(input: unknown) {
  const limit = typeof input === 'string' ? Number.parseInt(input, 10) : NaN
  if (Number.isFinite(limit)) {
    return Math.max(1, Math.min(200, limit))
  }
  return 50
}
