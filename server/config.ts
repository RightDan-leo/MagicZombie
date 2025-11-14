import { config as loadEnv } from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'

loadEnv()

const ROOT_DIR = process.cwd()

function resolveDbPath() {
  const custom = process.env.TELEMETRY_DB_PATH
  if (custom) {
    return path.resolve(ROOT_DIR, custom)
  }
  return path.join(ROOT_DIR, 'data', 'telemetry.db')
}

function ensureEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const appConfig = {
  port: Number(process.env.SERVER_PORT ?? process.env.PORT ?? 5050),
  sessionSecret: ensureEnv('SESSION_SECRET'),
  adminUsername: ensureEnv('ADMIN_USERNAME'),
  adminPassword: ensureEnv('ADMIN_PASSWORD'),
  telemetryIngestToken: ensureEnv('TELEMETRY_INGEST_TOKEN'),
  dbPath: resolveDbPath(),
}

fs.mkdirSync(path.dirname(appConfig.dbPath), { recursive: true })
