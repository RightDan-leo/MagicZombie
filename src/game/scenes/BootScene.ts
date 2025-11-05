import Phaser from 'phaser'

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  create() {
    this.createTextures()
    this.scene.start('PlayScene')
  }

  private createTextures() {
    if (!this.textures.exists('player')) {
      this.createCircleTexture('player', 16, 0x4fb8ff)
    }

    if (!this.textures.exists('enemy-small')) {
      this.createCircleTexture('enemy-small', 14, 0x7ba05b)
    }

    if (!this.textures.exists('enemy-dog')) {
      this.createCircleTexture('enemy-dog', 10, 0xb07f42)
    }

    if (!this.textures.exists('enemy-elite')) {
      this.createCircleTexture('enemy-elite', 20, 0xc9415f)
    }

    if (!this.textures.exists('enemy-boss')) {
      this.createCircleTexture('enemy-boss', 26, 0x8b1f3a)
    }

    if (!this.textures.exists('reward-rabbit')) {
      this.createCircleTexture('reward-rabbit', 12, 0xfff5a1)
    }

    if (!this.textures.exists('projectile-lightning')) {
      this.createRectangleTexture('projectile-lightning', 6, 48, 0xe6ff69)
    }

    if (!this.textures.exists('projectile-fire')) {
      this.createRectangleTexture('projectile-fire', 12, 32, 0xff8f4f)
    }

    if (!this.textures.exists('projectile-water')) {
      this.createRectangleTexture('projectile-water', 10, 40, 0x63d2ff)
    }
  }

  private createCircleTexture(key: string, radius: number, color: number) {
    const graphics = this.add.graphics({ x: 0, y: 0 })
    graphics.setVisible(false)
    graphics.fillStyle(color, 1)
    graphics.fillCircle(radius, radius, radius)
    graphics.generateTexture(key, radius * 2, radius * 2)
    graphics.destroy()
  }

  private createRectangleTexture(key: string, width: number, height: number, color: number) {
    const graphics = this.add.graphics({ x: 0, y: 0 })
    graphics.setVisible(false)
    graphics.fillStyle(color, 1)
    graphics.fillRoundedRect(0, 0, width, height, Math.min(width, height) * 0.4)
    graphics.generateTexture(key, width, height)
    graphics.destroy()
  }
}

