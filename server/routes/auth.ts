import { Router, type NextFunction, type Request, type Response } from 'express'
import { appConfig } from '../config.js'
import { isAuthenticated } from '../middleware/requireAuth.js'

export const authRouter = Router()

authRouter.get('/session', (req: Request, res: Response) => {
  res.json({
    authenticated: isAuthenticated(req),
    username: req.session?.user?.username ?? null,
  })
})

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string }

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' })
  }

  if (username !== appConfig.adminUsername || password !== appConfig.adminPassword) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  try {
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((error: Error | null) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })

    req.session.user = { username }
    req.session.save((error: Error | null) => {
      if (error) {
        next(error)
        return
      }
      res.json({ ok: true })
    })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/logout', (req: Request, res: Response, next: NextFunction) => {
  req.session.destroy((error: Error | null) => {
    if (error) {
      next(error)
      return
    }
    res.json({ ok: true })
  })
})
