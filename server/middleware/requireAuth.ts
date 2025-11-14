import type { NextFunction, Request, Response } from 'express'

export function isAuthenticated(req: Request) {
  return Boolean(req.session?.user)
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthenticated(req)) {
    return next()
  }
  return res.status(401).json({ error: 'Unauthorized' })
}
