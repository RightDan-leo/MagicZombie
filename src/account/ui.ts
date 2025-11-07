import {
  getAccountMode,
  loginWithMode,
  registerWithMode,
  type AccountMode,
} from './api'
import { type UserSession } from './types'

const LAST_USERNAME_KEY = 'magiczombie:lastUsername'

function createOverlay() {
  const overlay = document.createElement('div')
  overlay.className = 'account-overlay'

  const panel = document.createElement('div')
  panel.className = 'account-panel'

  const title = document.createElement('h1')
  title.textContent = '欢迎来到 MagicZombie'

  const description = document.createElement('p')
  description.textContent = '设置一个独一无二的用户名来保存你的闯关进度。'

  const notice = document.createElement('p')
  notice.className = 'account-notice'
  notice.hidden = true

  const form = document.createElement('form')
  form.className = 'account-form'

  const input = document.createElement('input')
  input.type = 'text'
  input.name = 'username'
  input.placeholder = '输入用户名（仅限字母、数字、下划线）'
  input.autocomplete = 'username'
  input.required = true
  input.maxLength = 20

  const message = document.createElement('div')
  message.className = 'account-message'

  const buttons = document.createElement('div')
  buttons.className = 'account-actions'

  const loginButton = document.createElement('button')
  loginButton.type = 'submit'
  loginButton.textContent = '登录'
  loginButton.dataset.action = 'login'

  const registerButton = document.createElement('button')
  registerButton.type = 'button'
  registerButton.textContent = '注册新账号'
  registerButton.dataset.action = 'register'

  buttons.append(loginButton, registerButton)
  form.append(input, buttons, message)
  panel.append(title, description, notice, form)
  overlay.append(panel)

  document.body.append(overlay)

  let pending = false
  let busy = false

  const updateDisabledState = () => {
    const disabled = pending || busy
    input.disabled = disabled
    loginButton.disabled = disabled
    registerButton.disabled = disabled
  }

  const setPending = (value: boolean) => {
    pending = value
    form.dataset.pending = value ? 'true' : 'false'
    updateDisabledState()
  }

  const setBusy = (value: boolean) => {
    busy = value
    form.dataset.busy = value ? 'true' : 'false'
    updateDisabledState()
  }

  const applyMode = (mode: 'pending' | AccountMode) => {
    if (mode === 'pending') {
      notice.hidden = false
      notice.dataset.variant = 'pending'
      notice.textContent = '正在检测账号服务，请稍候…'
      setPending(true)
      return
    }

    if (mode === 'local') {
      notice.hidden = false
      notice.dataset.variant = 'offline'
      notice.textContent = '未连接到远程存档服务，用户名和进度将仅保存在当前设备。'
    } else {
      notice.hidden = true
      delete notice.dataset.variant
      notice.textContent = ''
    }

    setPending(false)
  }

  return {
    overlay,
    form,
    input,
    message,
    registerButton,
    setBusy,
    setMode: applyMode,
  }
}

function validateUsername(value: string) {
  const trimmed = value.trim()
  if (trimmed.length < 3) {
    return '用户名至少需要 3 个字符'
  }
  if (!/^[_a-zA-Z0-9]+$/.test(trimmed)) {
    return '用户名只能包含字母、数字或下划线'
  }
  return null
}

async function attemptLogin(username: string, mode: AccountMode) {
  try {
    return await loginWithMode(mode, username)
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 404) {
      throw new Error('没有找到该用户名，请先注册')
    }
    throw error
  }
}

async function attemptRegister(username: string, mode: AccountMode) {
  try {
    return await registerWithMode(mode, username)
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 409) {
      throw new Error('该用户名已被使用，请选择其他名字')
    }
    throw error
  }
}

function setMessage(el: HTMLElement, text: string, variant: 'error' | 'success') {
  el.textContent = text
  el.dataset.variant = variant
}

function rememberUsername(username: string) {
  try {
    window.localStorage.setItem(LAST_USERNAME_KEY, username)
  } catch (error) {
    console.warn('无法保存用户名到本地存储', error)
  }
}

function readRememberedUsername() {
  try {
    return window.localStorage.getItem(LAST_USERNAME_KEY)
  } catch (error) {
    console.warn('无法读取本地存储的用户名', error)
    return null
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('timeout'))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

export async function ensureSession(): Promise<UserSession> {
  const modePromise = getAccountMode()
  const remembered = readRememberedUsername()
  if (remembered) {
    try {
      const detectedMode = await withTimeout(modePromise, 4000)
      const session = await attemptLogin(remembered, detectedMode)
      return session
    } catch (error) {
      console.warn('自动登录失败，将显示登录界面', error)
      try {
        window.localStorage.removeItem(LAST_USERNAME_KEY)
      } catch (storageError) {
        console.warn('无法清除本地存储中的用户名', storageError)
      }
    }
  }

  return new Promise<UserSession>((resolve) => {
    const { overlay, form, input, message, registerButton, setBusy, setMode } = createOverlay()

    if (remembered) {
      input.value = remembered
    }

    setMode('pending')
    setMessage(message, '正在检测账号服务，请稍候…', 'success')

    let activeMode: AccountMode = 'local'

    const updateMode = (mode: AccountMode) => {
      activeMode = mode
      setMode(mode)
      if (mode === 'remote') {
        setMessage(message, '已连接到远程账号服务，请登录或注册。', 'success')
      } else {
        setMessage(message, '离线模式已启用，用户名和进度将仅保存在当前设备。', 'success')
      }
    }

    let modeResolved = false

    const fallbackTimer = window.setTimeout(() => {
      if (!modeResolved) {
        console.warn('账号服务检测超时，切换为离线模式')
        updateMode('local')
      }
    }, 4000)

    modePromise
      .then((detectedMode) => {
        modeResolved = true
        clearTimeout(fallbackTimer)
        updateMode(detectedMode)
      })
      .catch((error) => {
        modeResolved = true
        clearTimeout(fallbackTimer)
        console.warn('账号服务检测失败，使用离线模式', error)
        updateMode('local')
      })

    const handleResult = (session: UserSession) => {
      rememberUsername(session.username)
      overlay.remove()
      clearTimeout(fallbackTimer)
      resolve(session)
    }

    const submit = async (action: 'login' | 'register') => {
      if (form.dataset.pending === 'true') {
        return
      }

      const username = input.value
      const errorText = validateUsername(username)
      if (errorText) {
        setMessage(message, errorText, 'error')
        return
      }

      setBusy(true)
      setMessage(message, action === 'login' ? '正在登录…' : '正在注册…', 'success')

      try {
        const session =
          action === 'login'
            ? await attemptLogin(username, activeMode)
            : await attemptRegister(username, activeMode)
        setMessage(message, action === 'login' ? '登录成功，正在进入游戏…' : '注册成功，正在进入游戏…', 'success')
        setTimeout(() => handleResult(session), 320)
      } catch (error) {
        const status = (error as Error & { status?: number }).status
        if (status === undefined) {
          setMessage(message, '网络请求失败，请稍后重试', 'error')
        } else {
          setMessage(message, (error as Error).message, 'error')
        }
      } finally {
        setBusy(false)
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      void submit('login')
    })

    registerButton.addEventListener('click', (event) => {
      event.preventDefault()
      void submit('register')
    })

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault()
        void submit('login')
      }
    })
  })
}
