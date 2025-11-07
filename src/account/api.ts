import type { SavedProgress, UserSession } from './types'

export type AccountMode = 'remote' | 'local'

interface StoredUser {
  username: string
  progress: SavedProgress | null
}

const USERS_STORAGE_KEY = 'magiczombie:accounts'

function cloneProgress(progress: SavedProgress): SavedProgress {
  return {
    ...progress,
    playerState: { ...progress.playerState },
  }
}

function resolveApiUrl(path: string) {
  const basePath = import.meta.env.BASE_URL ?? '/'
  const base = new URL(basePath.endsWith('/') ? basePath : `${basePath}/`, window.location.origin)
  return new URL(path.replace(/^\//, ''), base).toString()
}

async function sendJson<T>(path: string, init: RequestInit) {
  const response = await fetch(resolveApiUrl(path), {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  })

  const text = await response.text()
  const data = text ? (JSON.parse(text) as T) : (undefined as unknown as T)

  if (!response.ok) {
    const error = new Error('Request failed') as Error & { status?: number; data?: unknown }
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

let detectedMode: AccountMode | null = null
let detectionPromise: Promise<AccountMode> | null = null

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined'
}

let localStorageAvailable: boolean | null = null
let cachedUsers: Record<string, StoredUser> | null = null

function ensureLocalStorageAvailable() {
  if (localStorageAvailable !== null) {
    return localStorageAvailable
  }

  if (!isBrowser()) {
    localStorageAvailable = false
    return localStorageAvailable
  }

  try {
    const testKey = `${USERS_STORAGE_KEY}:test`
    window.localStorage.setItem(testKey, testKey)
    window.localStorage.removeItem(testKey)
    localStorageAvailable = true
  } catch (error) {
    console.warn('无法使用 localStorage 保存账号数据，将退回内存存储', error)
    localStorageAvailable = false
  }

  return localStorageAvailable
}

function readStoredUsers(): Record<string, StoredUser> {
  if (!isBrowser()) {
    if (!cachedUsers) {
      cachedUsers = {}
    }
    return cachedUsers
  }

  if (cachedUsers) {
    return cachedUsers
  }

  if (!ensureLocalStorageAvailable()) {
    cachedUsers = {}
    return cachedUsers
  }

  try {
    const raw = window.localStorage.getItem(USERS_STORAGE_KEY)
    cachedUsers = raw ? (JSON.parse(raw) as Record<string, StoredUser>) : {}
  } catch (error) {
    console.warn('解析本地账号存档失败，将重置为默认空集合', error)
    cachedUsers = {}
  }

  return cachedUsers
}

function writeStoredUsers(users: Record<string, StoredUser>) {
  cachedUsers = users

  if (!isBrowser() || !ensureLocalStorageAvailable()) {
    return
  }

  try {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
  } catch (error) {
    console.warn('无法写入账号存档到 localStorage', error)
  }
}

function getLocalUser(username: string) {
  const users = readStoredUsers()
  return users[username] ?? null
}

function setLocalUser(user: StoredUser) {
  const users = readStoredUsers()
  const nextUsers = { ...users, [user.username]: { ...user, progress: user.progress ? cloneProgress(user.progress) : null } }
  writeStoredUsers(nextUsers)
  return nextUsers[user.username]
}

async function detectAccountMode(): Promise<AccountMode> {
  if (detectedMode) {
    return detectedMode
  }

  if (detectionPromise) {
    return detectionPromise
  }

  detectionPromise = (async () => {
    try {
      await sendJson<{ ok: boolean }>('/api/health', { method: 'GET' })
      detectedMode = 'remote'
    } catch (error) {
      console.warn('远程账号服务不可用，切换为本地离线模式', error)
      detectedMode = 'local'
    }

    const resolvedMode = detectedMode
    detectionPromise = null
    return resolvedMode
  })()

  return detectionPromise
}

function toNotFoundError(): Error & { status?: number } {
  const error = new Error('没有找到该用户名，请先注册') as Error & { status?: number }
  error.status = 404
  return error
}

function toConflictError(): Error & { status?: number } {
  const error = new Error('该用户名已被使用，请选择其他名字') as Error & { status?: number }
  error.status = 409
  return error
}

async function registerRemote(username: string) {
  return sendJson<UserSession>('/api/users/register', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

async function loginRemote(username: string) {
  return sendJson<UserSession>('/api/users/login', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

async function persistRemote(username: string, progress: SavedProgress) {
  return sendJson<UserSession>(`/api/users/${encodeURIComponent(username)}/progress`, {
    method: 'PUT',
    body: JSON.stringify({ progress }),
  })
}

function registerLocal(username: string): UserSession {
  const existing = getLocalUser(username)
  if (existing) {
    throw toConflictError()
  }

  const stored = setLocalUser({ username, progress: null })
  return { username: stored.username, progress: stored.progress }
}

function loginLocal(username: string): UserSession {
  const user = getLocalUser(username)
  if (!user) {
    throw toNotFoundError()
  }

  return {
    username: user.username,
    progress: user.progress ? cloneProgress(user.progress) : null,
  }
}

function persistLocal(username: string, progress: SavedProgress): UserSession {
  const user = getLocalUser(username) ?? { username, progress: null }
  const stored = setLocalUser({ username: user.username, progress })
  return {
    username: stored.username,
    progress: stored.progress ? cloneProgress(stored.progress) : null,
  }
}

export async function getAccountMode(): Promise<AccountMode> {
  return detectAccountMode()
}

export function registerWithMode(mode: AccountMode, username: string) {
  return mode === 'remote' ? registerRemote(username) : registerLocal(username)
}

export function loginWithMode(mode: AccountMode, username: string) {
  return mode === 'remote' ? loginRemote(username) : loginLocal(username)
}

export function persistProgressWithMode(mode: AccountMode, username: string, progress: SavedProgress) {
  return mode === 'remote' ? persistRemote(username, progress) : persistLocal(username, progress)
}

export async function register(username: string) {
  const mode = await detectAccountMode()
  return registerWithMode(mode, username)
}

export async function login(username: string) {
  const mode = await detectAccountMode()
  return loginWithMode(mode, username)
}

export async function persistProgress(username: string, progress: SavedProgress) {
  const mode = await detectAccountMode()
  return persistProgressWithMode(mode, username, progress)
}
