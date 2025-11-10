import { doc, getDoc, setDoc } from 'firebase/firestore'

import { createInitialPlayerState } from '../game/logic/playerProgression'
import type { PlayerState } from '../game/types/player'
import { getFirestoreDb, isFirebaseEnabled } from './firebase'

export interface PlayerProfileRecord {
  id: string
  stageIndex: number
  bestScore: number
  playerState: PlayerState
  updatedAt: number
}

const COLLECTION = 'profiles'
const LOCAL_STORAGE_PREFIX = 'magiczombie:profile:'

function sanitizeState(state: PlayerState): PlayerState {
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

export function createDefaultProfile(id: string): PlayerProfileRecord {
  return {
    id,
    stageIndex: 0,
    bestScore: 0,
    playerState: createInitialPlayerState(),
    updatedAt: Date.now(),
  }
}

export function normalizeProfileId(input: string) {
  const trimmed = input.trim().normalize('NFC')
  if (!trimmed) {
    throw new Error('玩家 ID 不能为空')
  }
  if (trimmed.length < 2 || trimmed.length > 32) {
    throw new Error('玩家 ID 需要 2~32 个字符')
  }
  if (/[\/\\#?%]/.test(trimmed)) {
    throw new Error('玩家 ID 不能包含 / \\ # ? % 等特殊字符')
  }
  return trimmed
}

function serializeProfile(profile: PlayerProfileRecord) {
  return {
    stageIndex: profile.stageIndex,
    bestScore: profile.bestScore,
    playerState: sanitizeState(profile.playerState),
    updatedAt: profile.updatedAt,
  }
}

function mergeProfile(id: string, data: any): PlayerProfileRecord {
  const base = createDefaultProfile(id)
  if (!data || typeof data !== 'object') {
    return base
  }
  const stageIndex = typeof data.stageIndex === 'number' ? Math.max(0, Math.floor(data.stageIndex)) : base.stageIndex
  const bestScore = typeof data.bestScore === 'number' ? Math.max(0, Math.floor(data.bestScore)) : base.bestScore
  const playerState = sanitizeState({ ...base.playerState, ...(data.playerState ?? {}) })
  const updatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : base.updatedAt
  return {
    id,
    stageIndex,
    bestScore,
    playerState,
    updatedAt,
  }
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage
  } catch (error) {
    console.warn('localStorage unavailable', error)
    return null
  }
}

function getLocalKey(id: string) {
  return `${LOCAL_STORAGE_PREFIX}${id}`
}

function loadFromLocal(id: string) {
  const storage = getLocalStorage()
  if (!storage) {
    return null
  }
  const raw = storage.getItem(getLocalKey(id))
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    return mergeProfile(id, parsed)
  } catch (error) {
    console.warn('Failed to parse local profile', error)
    storage.removeItem(getLocalKey(id))
    return null
  }
}

function saveToLocal(profile: PlayerProfileRecord) {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }
  try {
    storage.setItem(getLocalKey(profile.id), JSON.stringify(serializeProfile(profile)))
  } catch (error) {
    console.warn('Failed to save local profile', error)
  }
}

async function loadFromRemote(id: string) {
  const db = getFirestoreDb()
  const ref = doc(db, COLLECTION, id)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    return mergeProfile(id, snap.data())
  }
  const profile = createDefaultProfile(id)
  await setDoc(ref, serializeProfile(profile))
  return profile
}

async function saveToRemote(profile: PlayerProfileRecord) {
  const db = getFirestoreDb()
  const ref = doc(db, COLLECTION, profile.id)
  await setDoc(ref, serializeProfile(profile), { merge: true })
}

export async function fetchProfile(id: string) {
  if (isFirebaseEnabled()) {
    return loadFromRemote(id)
  }
  const local = loadFromLocal(id)
  if (local) {
    return local
  }
  const fallback = createDefaultProfile(id)
  saveToLocal(fallback)
  return fallback
}

export async function persistProfile(profile: PlayerProfileRecord) {
  if (isFirebaseEnabled()) {
    await saveToRemote(profile)
  } else {
    saveToLocal(profile)
  }
}
