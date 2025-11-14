import Phaser from 'phaser'

import { GAME_HEIGHT, GAME_WIDTH } from './constants/dimensions'
import BootScene from './scenes/BootScene'
import PlayScene from './scenes/PlayScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#151820',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, PlayScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}

export default config
export { GAME_WIDTH, GAME_HEIGHT } from './constants/dimensions'

