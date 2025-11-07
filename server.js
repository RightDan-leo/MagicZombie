import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { stat } from 'fs/promises'
import fs from 'fs'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const distDir = path.resolve(process.env.DIST_DIR ?? path.join(__dirname, 'dist'))

if (!fs.existsSync(distDir)) {
  console.error(`Build directory "${distDir}" not found. Run "npm run build" before starting the server.`)
  process.exit(1)
}

const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(__dirname, 'data'))
fs.mkdirSync(dataDir, { recursive: true })
const usersFile = path.join(dataDir, 'users.json')

/** @type {Map<string, { username: string; progress: any | null }>} */
const users = new Map()

function loadUsersFromDisk() {
  if (!fs.existsSync(usersFile)) {
    return
  }

  try {
    const raw = fs.readFileSync(usersFile, 'utf-8')
    if (!raw) {
      return
    }
    const parsed = JSON.parse(raw)
    Object.entries(parsed).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') {
        return
      }
      const username = typeof value.username === 'string' ? value.username : key
      const progress = value.progress && typeof value.progress === 'object' ? value.progress : null
      users.set(key, { username, progress })
    })
  } catch (error) {
    console.warn('Failed to load users.json, starting with empty store:', error)
  }
}

loadUsersFromDisk()

async function persistUsersToDisk() {
  const serialized = Object.fromEntries(users.entries())
  const tmpPath = `${usersFile}.tmp`
  await fs.promises.writeFile(tmpPath, JSON.stringify(serialized, null, 2), 'utf-8')
  await fs.promises.rename(tmpPath, usersFile)
}

const PORT = Number(process.env.PORT ?? 4173)
const HOST = process.env.HOST ?? '0.0.0.0'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
}

function normalizeBasePath(basePath) {
  if (!basePath || basePath === '/') return '/'
  let normalized = basePath.trim()
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

const BASE_PATH = normalizeBasePath(process.env.BASE_PATH ?? process.env.VITE_BASE_PATH ?? '/')

const HASHED_ASSET_PATTERN = /\bassets\/[\w-]+\.[a-f0-9]{8,}\.[\w]+$/i

function cacheControlFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.html') {
    return 'no-cache, no-store, must-revalidate'
  }
  if (HASHED_ASSET_PATTERN.test(filePath)) {
    return 'public, max-age=31536000, immutable'
  }
  return 'public, max-age=3600'
}

function buildEtag(fileStat) {
  return `"${fileStat.size}-${Math.round(fileStat.mtimeMs)}"`
}

function applyResponseHeaders(res, filePath, fileStat, etag) {
  const ext = path.extname(filePath).toLowerCase()
  const type = MIME_TYPES[ext] ?? 'application/octet-stream'
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', cacheControlFor(filePath))
  res.setHeader('Last-Modified', fileStat.mtime.toUTCString())
  res.setHeader('ETag', etag)
}

function isNotModified(req, res, fileStat, etag) {
  const ifNoneMatch = req.headers['if-none-match']
  const ifModifiedSince = req.headers['if-modified-since']

  if (ifNoneMatch && ifNoneMatch.split(/\s*,\s*/).includes(etag)) {
    res.statusCode = 304
    res.removeHeader('Content-Length')
    res.end()
    return true
  }

  if (ifModifiedSince) {
    const sinceTime = new Date(ifModifiedSince)
    if (!Number.isNaN(sinceTime.getTime()) && fileStat.mtime <= sinceTime) {
      res.statusCode = 304
      res.removeHeader('Content-Length')
      res.end()
      return true
    }
  }

  return false
}

async function sendFile(req, res, filePath, fileStat, statusCode = 200, method = 'GET') {
  const etag = buildEtag(fileStat)
  applyResponseHeaders(res, filePath, fileStat, etag)
  if (isNotModified(req, res, fileStat, etag)) {
    return
  }

  res.setHeader('Content-Length', fileStat.size)
  res.statusCode = statusCode

  if (method === 'HEAD') {
    res.end()
    return
  }

  const stream = fs.createReadStream(filePath)
  stream.on('error', (error) => {
    console.error(`Failed to stream file ${filePath}:`, error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('Internal Server Error')
    } else {
      res.destroy(error)
    }
  })
  stream.pipe(res)
}

const ALLOWED_WEAPONS = new Set(['lightningChain', 'flamethrower', 'waterCannon'])

function normalizeUsername(username) {
  return username.trim().toLowerCase()
}

function validateUsername(username) {
  if (typeof username !== 'string') {
    return { valid: false, message: '用户名必须为字符串' }
  }
  const trimmed = username.trim()
  if (trimmed.length < 3) {
    return { valid: false, message: '用户名至少需要 3 个字符' }
  }
  if (!/^[_a-zA-Z0-9]+$/.test(trimmed)) {
    return { valid: false, message: '用户名只能包含字母、数字或下划线' }
  }
  return { valid: true, value: trimmed }
}

function sanitizePlayerState(raw) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const { maxHp, hp, speed, level, exp, nextExp, alive } = raw
  const numbers = { maxHp, hp, speed, level, exp, nextExp }
  for (const [key, value] of Object.entries(numbers)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null
    }
  }

  if (typeof alive !== 'boolean') {
    return null
  }

  return {
    maxHp: Math.max(1, maxHp),
    hp: Math.max(0, Math.min(hp, Math.max(1, maxHp))),
    speed: Math.max(0, speed),
    level: Math.max(1, Math.floor(level)),
    exp: Math.max(0, exp),
    nextExp: Math.max(1, nextExp),
    alive,
  }
}

function sanitizeProgress(raw) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const { stageIndex, score, equippedWeapon, playerState } = raw

  if (typeof stageIndex !== 'number' || !Number.isFinite(stageIndex)) {
    return null
  }
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return null
  }
  if (typeof equippedWeapon !== 'string' || !ALLOWED_WEAPONS.has(equippedWeapon)) {
    return null
  }

  const state = sanitizePlayerState(playerState)
  if (!state) {
    return null
  }

  return {
    stageIndex: Math.max(0, Math.floor(stageIndex)),
    score: Math.max(0, Math.floor(score)),
    equippedWeapon,
    playerState: state,
    updatedAt: new Date().toISOString(),
  }
}

function writeJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0

    req.on('data', (chunk) => {
      chunks.push(chunk)
      size += chunk.length
      if (size > 512 * 1024) {
        reject(new Error('请求体太大'))
        req.destroy()
      }
    })

    req.on('end', () => {
      if (size === 0) {
        resolve({})
        return
      }
      try {
        const buffer = Buffer.concat(chunks)
        const text = buffer.toString('utf-8')
        resolve(text ? JSON.parse(text) : {})
      } catch (error) {
        reject(new Error('JSON 解析失败'))
      }
    })

    req.on('error', (error) => reject(error))
  })
}

function sendUserResponse(res, user, statusCode = 200) {
  writeJson(res, statusCode, { username: user.username, progress: user.progress ?? null })
}

async function handleApiRequest(req, res, method, relativePath) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS,HEAD')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const segments = relativePath.split('/').filter(Boolean)
  if (segments[0] !== 'api') {
    writeJson(res, 404, { message: 'Not Found' })
    return
  }

  if (segments.length === 2 && segments[1] === 'health') {
    if (method !== 'GET' && method !== 'HEAD') {
      writeJson(res, 405, { message: 'Method Not Allowed' })
      return
    }

    writeJson(res, 200, { ok: true })
    return
  }

  if (segments[1] !== 'users') {
    writeJson(res, 404, { message: 'Not Found' })
    return
  }

  if (segments.length === 3 && segments[2] === 'register') {
    if (method !== 'POST') {
      writeJson(res, 405, { message: 'Method Not Allowed' })
      return
    }

    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      writeJson(res, 400, { message: (error instanceof Error ? error.message : 'Bad Request') })
      return
    }

    const check = validateUsername(body?.username)
    if (!check.valid) {
      writeJson(res, 400, { message: check.message })
      return
    }

    const normalized = normalizeUsername(check.value)
    if (users.has(normalized)) {
      writeJson(res, 409, { message: '用户名已被占用' })
      return
    }

    const user = { username: check.value, progress: null }
    users.set(normalized, user)
    await persistUsersToDisk()
    sendUserResponse(res, user, 201)
    return
  }

  if (segments.length === 3 && segments[2] === 'login') {
    if (method !== 'POST') {
      writeJson(res, 405, { message: 'Method Not Allowed' })
      return
    }

    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      writeJson(res, 400, { message: (error instanceof Error ? error.message : 'Bad Request') })
      return
    }

    const check = validateUsername(body?.username)
    if (!check.valid) {
      writeJson(res, 400, { message: check.message })
      return
    }

    const normalized = normalizeUsername(check.value)
    const existing = users.get(normalized)
    if (!existing) {
      writeJson(res, 404, { message: '用户名不存在' })
      return
    }

    sendUserResponse(res, existing, 200)
    return
  }

  if (segments.length === 4 && segments[3] === 'progress') {
    if (method !== 'PUT') {
      writeJson(res, 405, { message: 'Method Not Allowed' })
      return
    }

    const rawUsername = segments[2]
    const normalized = normalizeUsername(rawUsername)
    const existing = users.get(normalized)
    if (!existing) {
      writeJson(res, 404, { message: '用户名不存在' })
      return
    }

    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      writeJson(res, 400, { message: (error instanceof Error ? error.message : 'Bad Request') })
      return
    }

    const progress = sanitizeProgress(body?.progress)
    if (!progress) {
      writeJson(res, 400, { message: '无效的进度数据' })
      return
    }

    existing.progress = progress
    users.set(normalized, existing)
    await persistUsersToDisk()
    sendUserResponse(res, existing, 200)
    return
  }

  writeJson(res, 404, { message: 'Not Found' })
}

async function handleRequest(req, res) {
  const method = req.method ?? 'GET'
  const requestUrl = req.url ?? '/'
  let pathname
  try {
    const url = new URL(requestUrl, `http://${req.headers.host ?? 'localhost'}`)
    pathname = url.pathname
  } catch (error) {
    res.statusCode = 400
    res.end('Bad Request')
    return
  }

  if (BASE_PATH !== '/' && !pathname.startsWith(BASE_PATH)) {
    res.statusCode = 404
    res.end('Not Found')
    return
  }

  let relativePath = BASE_PATH === '/' ? pathname : pathname.slice(BASE_PATH.length) || '/'
  try {
    relativePath = decodeURIComponent(relativePath)
  } catch (error) {
    res.statusCode = 400
    res.end('Bad Request')
    return
  }

  if (relativePath.startsWith('/api/')) {
    await handleApiRequest(req, res, method, relativePath)
    return
  }

  if (!['GET', 'HEAD'].includes(method)) {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.end('Method Not Allowed')
    return
  }

  if (relativePath === '/' || relativePath === '') {
    relativePath = '/index.html'
  }

  const requestedPath = path.join(distDir, relativePath)
  if (!requestedPath.startsWith(distDir)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  try {
    let filePath = requestedPath
    let fileStat = await stat(requestedPath)
    if (fileStat.isDirectory()) {
      filePath = path.join(requestedPath, 'index.html')
      fileStat = await stat(filePath)
    }
    await sendFile(req, res, filePath, fileStat, 200, method)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('Failed to serve request:', error)
      res.statusCode = 500
      res.end('Internal Server Error')
      return
    }

    const shouldFallback = !path.extname(relativePath)
    if (!shouldFallback) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    const fallbackPath = path.join(distDir, 'index.html')
    if (!fallbackPath.startsWith(distDir) || !fs.existsSync(fallbackPath)) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }
    const fallbackStat = await stat(fallbackPath)
    await sendFile(req, res, fallbackPath, fallbackStat, 200, method)
  }
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('Unexpected error while handling request:', error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('Internal Server Error')
    } else {
      res.destroy()
    }
  })
})

server.listen(PORT, HOST, () => {
  const baseDisplay = BASE_PATH === '/' ? '' : BASE_PATH
  console.log(`Static server ready at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}${baseDisplay}`)
  if (BASE_PATH !== '/') {
    console.log(`Serving with base path "${BASE_PATH}". Ensure the build uses the same base via VITE_BASE_PATH.`)
  }
})
