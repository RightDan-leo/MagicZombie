import Phaser from 'phaser'
import './style.css'
import config from './game/config'
import { ensureSession } from './account/ui'
import { setSession } from './account/sessionStore'

async function bootstrap() {
  try {
    const session = await ensureSession()
    setSession(session)
    new Phaser.Game(config)
  } catch (error) {
    console.error('无法初始化用户会话', error)
    const container = document.getElementById('app')
    if (container) {
      container.innerHTML =
        '<div class="fatal-error">无法连接账号服务，请稍后刷新页面重试。</div>'
    }
  }
}

void bootstrap()
