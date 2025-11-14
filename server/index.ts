import express, { type NextFunction, type Request, type Response } from 'express'
import path from 'node:path'
import session from 'express-session'
import { fileURLToPath } from 'node:url'
import { appConfig } from './config.js'
import { authRouter } from './routes/auth.js'
import { telemetryRouter } from './routes/telemetry.js'
import { adminRouter } from './routes/admin.js'

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')

app.set('trust proxy', 1)

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(
  session({
    secret: appConfig.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  }),
)

app.use('/api/auth', authRouter)
app.use('/api/telemetry', telemetryRouter)
app.use('/api/admin', adminRouter)

app.use(express.static(publicDir))

app.get('/', (_req: Request, res: Response) => {
  res.redirect('/admin')
})

app.get('/admin', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'admin.html'))
})

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error', error)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(appConfig.port, () => {
  console.log(`[telemetry] server is running on http://localhost:${appConfig.port}`)
})
