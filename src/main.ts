import Phaser from 'phaser'

import './style.css'
import config from './game/config'
import { ensureProfileSelected } from './ui/profileGate'
import { ensureWeaponSelected } from './ui/weaponGate'

async function bootstrap() {
  try {
    await ensureProfileSelected()
    await ensureWeaponSelected()
  } catch (error) {
    console.error('Failed to init player profile', error)
    const mountNode = document.getElementById('app')
    if (mountNode) {
      mountNode.innerHTML = '<p style="padding:16px;color:#fff;">无法创建玩家档案，请刷新页面重试。</p>'
    }
    return
  }

  new Phaser.Game(config)
}

bootstrap()
