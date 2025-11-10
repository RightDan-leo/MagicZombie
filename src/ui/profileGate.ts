import { profileManager } from '../state/profileManager'
import { normalizeProfileId } from '../services/profileStorage'

const LAST_PROFILE_KEY = 'magiczombie:lastProfileId'

function safeGetParams() {
  if (typeof window === 'undefined') {
    return null
  }
  return new URLSearchParams(window.location.search)
}

function safeGetLocal(key: string) {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(key)
  } catch (error) {
    console.warn('localStorage unavailable', error)
    return null
  }
}

function safeSetLocal(key: string, value: string) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(key, value)
  } catch (error) {
    console.warn('localStorage unavailable', error)
  }
}

function safeRemoveLocal(key: string) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.warn('localStorage unavailable', error)
  }
}

function getStoredProfileId() {
  const params = safeGetParams()
  if (!params) {
    return null
  }

  if (params.get('resetProfile') === '1') {
    safeRemoveLocal(LAST_PROFILE_KEY)
    params.delete('resetProfile')
    params.delete('profileId')
    if (typeof window !== 'undefined') {
      const nextSearch = params.toString()
      const searchPart = nextSearch ? `?${nextSearch}` : ''
      const nextUrl = `${window.location.pathname}${searchPart}${window.location.hash}`
      window.history.replaceState({}, '', nextUrl)
    }
    return null
  }

  const queryId = params.get('profileId')
  if (queryId) {
    try {
      return normalizeProfileId(queryId)
    } catch (error) {
      console.warn('Invalid profileId query param', error)
    }
  }
  const fallback = safeGetLocal(LAST_PROFILE_KEY)
  if (fallback) {
    try {
      return normalizeProfileId(fallback)
    } catch (error) {
      safeRemoveLocal(LAST_PROFILE_KEY)
    }
  }
  const defaultId = import.meta.env.VITE_DEFAULT_PROFILE_ID
  if (defaultId) {
    try {
      return normalizeProfileId(defaultId)
    } catch (error) {
      console.warn('Invalid VITE_DEFAULT_PROFILE_ID', error)
    }
  }
  return null
}

async function tryLoadProfile(id: string) {
  const profile = await profileManager.bootstrap(id)
  safeSetLocal(LAST_PROFILE_KEY, id)
  return profile
}

function setLoadingState(button: HTMLButtonElement, loading: boolean) {
  button.disabled = loading
  button.dataset.loading = String(loading)
}

function attachSwitchButton() {
  if (typeof document === 'undefined') {
    return
  }
  if (document.querySelector('.profile-switch')) {
    return
  }
  const button = document.createElement('button')
  button.className = 'profile-switch'
  button.type = 'button'
  button.textContent = '切换玩家'
  button.addEventListener('click', () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('profileId')
    url.searchParams.set('resetProfile', '1')
    window.location.href = url.toString()
  })
  document.body.appendChild(button)
}

export async function ensureProfileSelected() {
  const autoId = getStoredProfileId()
  if (autoId) {
    try {
      await tryLoadProfile(autoId)
      attachSwitchButton()
      return
    } catch (error) {
      console.error('自动加载玩家 ID 失败', error)
    }
  }

  return new Promise<void>((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'profile-gate'

    overlay.innerHTML = `
      <div class="profile-gate__panel">
        <h2>请输入玩家 ID</h2>
        <p>可输入 2-32 个字符，支持中文与英文。我们会根据该 ID 保存您的进度。</p>
        <form class="profile-gate__form">
          <input type="text" name="playerId" placeholder="例如：夜行者 或 NightHunter" required minlength="2" maxlength="32" />
          <button type="submit">开始游戏</button>
          <p class="profile-gate__error" aria-live="polite"></p>
        </form>
      </div>
    `

    document.body.appendChild(overlay)
    const form = overlay.querySelector('form') as HTMLFormElement
    const input = form.querySelector('input') as HTMLInputElement
    const button = form.querySelector('button') as HTMLButtonElement
    const errorLabel = form.querySelector('.profile-gate__error') as HTMLParagraphElement

    const lastId = safeGetLocal(LAST_PROFILE_KEY)
    if (lastId) {
      input.value = lastId
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      errorLabel.textContent = ''
      const rawId = input.value
      let normalized: string
      try {
        normalized = normalizeProfileId(rawId)
      } catch (error) {
        errorLabel.textContent = error instanceof Error ? error.message : '玩家 ID 无效'
        return
      }

      setLoadingState(button, true)
      try {
        await tryLoadProfile(normalized)
        overlay.remove()
        attachSwitchButton()
        resolve()
      } catch (error) {
        console.error('Failed to load profile', error)
        errorLabel.textContent = '加载玩家数据失败，请稍后重试'
      } finally {
        setLoadingState(button, false)
      }
    })
  })
}
