import Phaser from 'phaser'

import { queueProgressSave } from '../../account/progress'
import type { SavedProgress } from '../../account/types'
import { GAME_HEIGHT, GAME_WIDTH } from '../config'
import { EnemyDefinitions } from '../data/enemies'
import { StageDefinitions } from '../data/stages'
import { WeaponDefinitions } from '../data/weapons'
import type { EnemyId, StageDefinition, WeaponId } from '../data/types'
import { applyExperienceInPlace, createInitialPlayerState } from '../logic/playerProgression'
import { getSpawnInterval, pickEnemyId, resolveBatchCount } from '../logic/spawnRules'
import type { RandomFloatFn, RandomIntFn } from '../logic/spawnRules'
import type { PlayerState } from '../types/player'

type EnemySprite = Phaser.Physics.Arcade.Sprite & {
  enemyId: EnemyId
  hp: number
  maxHp: number
}

type ProjectileSprite = Phaser.Physics.Arcade.Sprite & {
  damage: number
  penetration: number
  element: 'water' | 'generic'
}

type MovementKeys = {
  up: Phaser.Input.Keyboard.Key
  down: Phaser.Input.Keyboard.Key
  left: Phaser.Input.Keyboard.Key
  right: Phaser.Input.Keyboard.Key
}

type DebugWindow = Window & {
  __MAGICZOMBIE_DEBUG__?: {
    stageId: number | null
    score: number
    player: { x: number; y: number }
    enemyCount: number
    hudText: string
  }
}

const ENEMY_LIMIT = 60
const PLAYER_INVULNERABLE_TIME = 600

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super('PlayScene')
  }

  private player!: Phaser.Physics.Arcade.Sprite

  private playerState!: PlayerState

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys

  private movementKeys!: MovementKeys

  private enemies!: Phaser.Physics.Arcade.Group

  private projectiles!: Phaser.Physics.Arcade.Group

  private hudText!: Phaser.GameObjects.Text

  private stageIndex = 0

  private stage!: StageDefinition

  private score = 0

  private elapsedTime = 0

  private spawnTimer?: Phaser.Time.TimerEvent

  private attackTimer?: Phaser.Time.TimerEvent

  private playerHitCooldown = 0

  private stageCleared = false

  private equippedWeapon: WeaponId = 'lightningChain'

  private stageBanner?: Phaser.GameObjects.Text

  private resumeProgress?: SavedProgress

  init(data: { progress?: SavedProgress | null } = {}) {
    this.resumeProgress = data.progress ?? undefined
  }

  create() {
    const hasResumeProgress = Boolean(this.resumeProgress)
    this.playerState = createInitialPlayerState()

    if (this.resumeProgress) {
      this.restoreProgress(this.resumeProgress)
    } else {
      this.score = 0
      this.stageIndex = 0
      this.equippedWeapon = 'lightningChain'
    }
    this.resumeProgress = undefined

    const keyboard = this.input.keyboard
    if (!keyboard) {
      throw new Error('Keyboard plugin is not available')
    }

    this.cursors = keyboard.createCursorKeys()
    this.movementKeys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as MovementKeys

    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT)

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x10131f).setOrigin(0)

    this.player = this.physics.add
      .sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'player')
      .setCircle(16)
      .setCollideWorldBounds(true)
      .setDepth(2)

    this.enemies = this.physics.add.group({ runChildUpdate: false })
    this.projectiles = this.physics.add.group({ runChildUpdate: false })

    this.hudText = this.add
      .text(16, 16, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f5f7ff',
      })
      .setDepth(5)
      .setShadow(1, 1, '#000000', 2)

    this.physics.add.overlap(
      this.player,
      this.enemies,
      (_, enemy) => {
        this.onEnemyTouchesPlayer(enemy as EnemySprite)
      },
      undefined,
      this,
    )

    this.physics.add.overlap(
      this.projectiles,
      this.enemies,
      (projectile, enemy) => {
        this.onProjectileHitsEnemy(projectile as ProjectileSprite, enemy as EnemySprite)
      },
      undefined,
      this,
    )

    const weaponKeys = keyboard.addKeys({
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
    }) as Record<'one' | 'two' | 'three', Phaser.Input.Keyboard.Key>

    weaponKeys.one.on('down', () => this.switchWeapon('lightningChain'))
    weaponKeys.two.on('down', () => this.switchWeapon('flamethrower'))
    weaponKeys.three.on('down', () => this.switchWeapon('waterCannon'))

    keyboard.on('keydown-R', () => {
      if (!this.playerState.alive) {
        this.restartStage()
      }
    })

    keyboard.on('keydown-N', () => {
      if (this.stageCleared) {
        this.advanceToNextStage()
      }
    })

    this.startStage(StageDefinitions[this.stageIndex], { resume: hasResumeProgress })
  }

  update(_time: number, delta: number) {
    if (!this.playerState.alive) {
      return
    }

    this.handlePlayerMovement()
    this.updateEnemiesAI(delta)
    this.updateProjectiles(delta)

    this.elapsedTime += delta / 1000
    this.updateHud()
    this.publishDebugInfo()
  }

  private restoreProgress(progress: SavedProgress) {
    this.stageIndex = Phaser.Math.Clamp(progress.stageIndex, 0, StageDefinitions.length - 1)
    this.playerState = { ...progress.playerState }
    this.score = Math.max(0, Math.floor(progress.score))
    this.equippedWeapon = progress.equippedWeapon
  }

  private persistProgress(immediate = false) {
    queueProgressSave(
      {
        stageIndex: this.stageIndex,
        score: this.score,
        equippedWeapon: this.equippedWeapon,
        playerState: { ...this.playerState },
      },
      { immediate },
    )
  }

  private startStage(stage: StageDefinition, options?: { resume?: boolean }) {
    const resume = options?.resume ?? false
    this.stage = stage
    this.elapsedTime = 0
    this.stageCleared = false
    this.playerHitCooldown = 0

    this.enemies.clear(true, true)
    this.projectiles.clear(true, true)

    if (!resume) {
      this.score = 0
      this.playerState.hp = this.playerState.maxHp
      this.playerState.alive = true
    } else {
      this.score = Math.max(0, this.score)
      this.playerState.hp = Phaser.Math.Clamp(this.playerState.hp, 0, this.playerState.maxHp)
      this.playerState.alive = this.playerState.hp > 0 && this.playerState.alive
    }
    this.player.clearTint()
    this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2)
    this.player.body?.reset(GAME_WIDTH / 2, GAME_HEIGHT / 2)

    this.scheduleNextSpawn(true)
    this.setupAttackTimer()

    if (resume && !this.playerState.alive) {
      this.showOverlayMessage('你阵亡了', '按 R 重新开始当前关卡')
    } else {
      this.hideOverlay()
    }

    this.showStageBanner(stage)
    this.persistProgress(true)
  }

  private scheduleNextSpawn(useBaseDelay = false) {
    this.spawnTimer?.remove(false)

    if (!this.stage || !this.playerState.alive || this.stageCleared) {
      this.spawnTimer = undefined
      return
    }

    const delay = useBaseDelay ? this.stage.baseSpawnInterval : getSpawnInterval(this.stage, this.score)

    this.spawnTimer = this.time.addEvent({
      delay,
      callback: () => {
        this.spawnWave()
        this.scheduleNextSpawn()
      },
    })
  }

  private handlePlayerMovement() {
    const left = this.cursors.left?.isDown || this.movementKeys.left.isDown
    const right = this.cursors.right?.isDown || this.movementKeys.right.isDown
    const up = this.cursors.up?.isDown || this.movementKeys.up.isDown
    const down = this.cursors.down?.isDown || this.movementKeys.down.isDown

    const direction = new Phaser.Math.Vector2(0, 0)
    if (left) direction.x -= 1
    if (right) direction.x += 1
    if (up) direction.y -= 1
    if (down) direction.y += 1

    if (direction.lengthSq() > 0) {
      direction.normalize()
      this.player.setVelocity(direction.x * this.playerState.speed, direction.y * this.playerState.speed)
    } else {
      this.player.setVelocity(0, 0)
    }
  }

  private updateEnemiesAI(delta: number) {
    const playerPosition = new Phaser.Math.Vector2(this.player.x, this.player.y)
    const rabbitExists = this.enemies
      .getChildren()
      .some((child) => (child as EnemySprite).enemyId === 'rewardRabbit')

    this.enemies.getChildren().forEach((child) => {
      const enemy = child as EnemySprite
      if (!enemy.active) {
        return
      }

      const definition = EnemyDefinitions[enemy.enemyId]
      const current = new Phaser.Math.Vector2(enemy.x, enemy.y)
      const distance = current.distance(playerPosition)
      const slowExpire = enemy.getData('slowExpire') as number | undefined
      const speedModifier = slowExpire && slowExpire > this.time.now ? 0.65 : 1
      const moveSpeed = definition.moveSpeed * speedModifier

      switch (definition.aiBehavior) {
        case 'chaser':
          this.physics.moveToObject(enemy, this.player, moveSpeed)
          break
        case 'tank':
          this.physics.moveToObject(enemy, this.player, moveSpeed)
          break
        case 'pouncer':
          this.updatePouncer(enemy, distance, moveSpeed)
          break
        case 'boss':
          this.updateBoss(enemy, delta, moveSpeed)
          break
        case 'evader':
          this.updateEvader(enemy, distance, rabbitExists, moveSpeed)
          break
        default:
          this.physics.moveToObject(enemy, this.player, moveSpeed)
      }
    })
  }

  private updatePouncer(enemy: EnemySprite, distanceToPlayer: number, moveSpeed: number) {
    const now = this.time.now
    const cooldown = enemy.getData('pounceCooldown') as number | undefined

    if (!cooldown || now > cooldown) {
      if (distanceToPlayer > 220) {
        this.physics.moveToObject(enemy, this.player, moveSpeed * 1.1)
      } else {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y)
        const impulse = moveSpeed * 1.6
        const body = enemy.body as Phaser.Physics.Arcade.Body | undefined
        body?.setVelocity(Math.cos(angle) * impulse, Math.sin(angle) * impulse)
        enemy.setData('pounceCooldown', now + 1400)
      }
    }
  }

  private updateBoss(enemy: EnemySprite, _delta: number, moveSpeed: number) {
    const phase = enemy.getData('phase') ?? 'approach'
    if (phase === 'approach') {
      this.physics.moveToObject(enemy, this.player, moveSpeed)
    }
  }

  private updateEvader(enemy: EnemySprite, distance: number, rabbitExists: boolean, moveSpeed: number) {
    const desiredDistance = rabbitExists ? 260 : 360
    const direction = new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y)

    if (distance < desiredDistance) {
      direction.normalize()
      enemy.setVelocity(direction.x * moveSpeed, direction.y * moveSpeed)
    } else {
      enemy.setVelocity(0, 0)
      enemy.setAngularVelocity(30)
    }
  }

  private spawnWave() {
    if (this.stageCleared || !this.playerState.alive) {
      return
    }

    if (this.enemies.countActive(true) >= ENEMY_LIMIT) {
      return
    }

    const existingEnemyIds = this.enemies
      .getChildren()
      .map((enemy) => (enemy as EnemySprite).enemyId)

    const randomFloat: RandomFloatFn = (max) => Phaser.Math.FloatBetween(0, max)
    const enemyId = pickEnemyId(this.stage, existingEnemyIds, randomFloat)

    if (!enemyId) {
      return
    }

    const rule = this.stage.spawnTable.find((entry) => entry.enemyId === enemyId)
    const randomInt: RandomIntFn = (min, max) => Phaser.Math.Between(min, max)
    const batchCount = resolveBatchCount(enemyId, rule, existingEnemyIds, randomInt)

    for (let i = 0; i < batchCount; i += 1) {
      this.spawnEnemy(enemyId)
    }
  }

  private spawnEnemy(enemyId: EnemyId) {
    const definition = EnemyDefinitions[enemyId]
    const spawnPoint = this.randomSpawnPoint()
    const texture = this.getEnemyTexture(enemyId)

    const enemy = this.physics.add
      .sprite(spawnPoint.x, spawnPoint.y, texture)
      .setDepth(1) as EnemySprite

    enemy.enemyId = enemyId
    enemy.maxHp = definition.maxHp
    enemy.hp = definition.maxHp
    enemy.setCircle(Math.floor(enemy.width / 2))
    enemy.setCollideWorldBounds(false)

    if (enemyId === 'rewardRabbit') {
      enemy.setAlpha(0.9)
    }

    this.enemies.add(enemy)
  }

  private randomSpawnPoint() {
    const margin = 40
    const side = Phaser.Math.Between(0, 3)
    switch (side) {
      case 0:
        return { x: Phaser.Math.Between(margin, GAME_WIDTH - margin), y: -margin }
      case 1:
        return { x: GAME_WIDTH + margin, y: Phaser.Math.Between(margin, GAME_HEIGHT - margin) }
      case 2:
        return { x: Phaser.Math.Between(margin, GAME_WIDTH - margin), y: GAME_HEIGHT + margin }
      default:
        return { x: -margin, y: Phaser.Math.Between(margin, GAME_HEIGHT - margin) }
    }
  }

  private getEnemyTexture(enemyId: EnemyId) {
    switch (enemyId) {
      case 'zombieDog':
        return 'enemy-dog'
      case 'zombieMedium':
      case 'zombieBear':
        return 'enemy-elite'
      case 'zombieLarge':
        return 'enemy-boss'
      case 'rewardRabbit':
        return 'reward-rabbit'
      default:
        return 'enemy-small'
    }
  }

  private performWeaponAttack() {
    if (!this.playerState.alive) {
      return
    }

    switch (this.equippedWeapon) {
      case 'lightningChain':
        this.performLightningChain()
        break
      case 'flamethrower':
        this.performFlamethrower()
        break
      case 'waterCannon':
        this.performWaterCannon()
        break
      default:
        this.performLightningChain()
    }
  }

  private performLightningChain() {
    const weapon = WeaponDefinitions.lightningChain
    const enemies = this.getEnemiesInRange(weapon.range)

    if (enemies.length === 0) {
      return
    }

    let sourceX = this.player.x
    let sourceY = this.player.y

    const targets = enemies.slice(0, weapon.chainTargets ?? 1)
    targets.forEach((enemy) => {
      this.drawLightning(sourceX, sourceY, enemy.x, enemy.y)
      this.damageEnemy(enemy, weapon.baseDamage)
      sourceX = enemy.x
      sourceY = enemy.y
    })
  }

  private performFlamethrower() {
    const weapon = WeaponDefinitions.flamethrower
    const targets = this.getEnemiesInRange(weapon.range)

    if (targets.length === 0) {
      return
    }

    const primary = targets[0]
    const direction = new Phaser.Math.Vector2(primary.x - this.player.x, primary.y - this.player.y)
    if (direction.lengthSq() === 0) {
      direction.set(1, 0)
    }
    direction.normalize()

    const coneTargets = this.getEnemiesWithinCone(weapon.range, direction, Phaser.Math.DegToRad(50))

    coneTargets.slice(0, Math.min(6, coneTargets.length)).forEach((enemy) => {
      this.damageEnemy(enemy, weapon.baseDamage)
    })

    this.drawFlamethrowerCone(direction, weapon.range)
  }

  private performWaterCannon() {
    const weapon = WeaponDefinitions.waterCannon
    const enemies = this.getEnemiesInRange(weapon.range)

    if (enemies.length === 0) {
      return
    }

    const target = enemies[0]
    const direction = new Phaser.Math.Vector2(target.x - this.player.x, target.y - this.player.y)
    if (direction.lengthSq() === 0) {
      direction.set(1, 0)
    }
    direction.normalize()

    const projectile = this.physics.add.sprite(this.player.x, this.player.y, 'projectile-water') as ProjectileSprite
    projectile.damage = weapon.baseDamage
    projectile.penetration = weapon.penetration ?? 1
    projectile.element = 'water'
    projectile.setDepth(3)
    projectile.setRotation(direction.angle() + Math.PI / 2)
    projectile.setVelocity(direction.x * (weapon.projectileSpeed ?? 520), direction.y * (weapon.projectileSpeed ?? 520))
    projectile.setData('expire', this.time.now + 1400)
    projectile.setData('recentHits', new Set<EnemySprite>())

    this.projectiles.add(projectile)
  }

  private getEnemiesInRange(range: number) {
    const list = this.enemies.getChildren() as EnemySprite[]
    return list
      .filter((enemy) => enemy.active)
      .map((enemy) => ({ enemy, distance: Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) }))
      .filter((entry) => entry.distance <= range)
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.enemy)
  }

  private getEnemiesWithinCone(range: number, direction: Phaser.Math.Vector2, halfAngle: number) {
    const cosThreshold = Math.cos(halfAngle)
    const list = this.enemies.getChildren() as EnemySprite[]

    return list
      .filter((enemy) => enemy.active)
      .map((enemy) => {
        const toEnemy = new Phaser.Math.Vector2(enemy.x - this.player.x, enemy.y - this.player.y)
        const distance = toEnemy.length()
        if (distance === 0 || distance > range) {
          return null
        }
        toEnemy.normalize()
        const dot = Phaser.Math.Clamp(direction.dot(toEnemy), -1, 1)
        return dot >= cosThreshold ? { enemy, distance } : null
      })
      .filter((entry): entry is { enemy: EnemySprite; distance: number } => entry !== null)
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.enemy)
  }

  private drawLightning(sourceX: number, sourceY: number, targetX: number, targetY: number) {
    const graphics = this.add.graphics()
    graphics.setDepth(4)
    graphics.lineStyle(3, 0x8ce2ff, 0.95)

    const points: Phaser.Math.Vector2[] = []
    const segmentCount = 12
    for (let i = 0; i <= segmentCount; i += 1) {
      const t = i / segmentCount
      const x = Phaser.Math.Linear(sourceX, targetX, t)
      const y = Phaser.Math.Linear(sourceY, targetY, t)
      const offset = (Math.random() - 0.5) * 18
      points.push(new Phaser.Math.Vector2(x + offset, y + offset))
    }

    graphics.beginPath()
    graphics.moveTo(sourceX, sourceY)
    points.forEach((point) => graphics.lineTo(point.x, point.y))
    graphics.strokePath()

    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 160,
      onComplete: () => graphics.destroy(),
    })
  }

  private drawFlamethrowerCone(direction: Phaser.Math.Vector2, range: number) {
    const graphics = this.add.graphics()
    graphics.setDepth(4)
    graphics.fillStyle(0xff8f4f, 0.45)

    const originX = this.player.x
    const originY = this.player.y
    const angle = direction.angle()
    const halfSpread = Phaser.Math.DegToRad(30)
    const leftAngle = angle - halfSpread
    const rightAngle = angle + halfSpread
    const tipX = originX + Math.cos(angle) * range
    const tipY = originY + Math.sin(angle) * range
    const leftX = originX + Math.cos(leftAngle) * range
    const leftY = originY + Math.sin(leftAngle) * range
    const rightX = originX + Math.cos(rightAngle) * range
    const rightY = originY + Math.sin(rightAngle) * range

    graphics.beginPath()
    graphics.moveTo(originX, originY)
    graphics.lineTo(leftX, leftY)
    graphics.lineTo(tipX, tipY)
    graphics.lineTo(rightX, rightY)
    graphics.closePath()
    graphics.fillPath()

    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 180,
      onComplete: () => graphics.destroy(),
    })
  }

  private damageEnemy(enemy: EnemySprite, amount: number) {
    enemy.hp -= amount
    if (enemy.hp <= 0) {
      this.handleEnemyKilled(enemy)
    } else {
      enemy.setTintFill(0xffffcc)
      this.time.delayedCall(80, () => {
        enemy.clearTint()
      })
    }
  }

  private handleEnemyKilled(enemy: EnemySprite) {
    const definition = EnemyDefinitions[enemy.enemyId]
    this.addScore(definition.score)
    this.addExperience(definition.experience)

    enemy.disableBody(true, true)
    enemy.destroy()
  }

  private addScore(amount: number) {
    this.score += amount
    this.persistProgress()
    if (this.score >= this.stage.targetScore && !this.stageCleared) {
      this.handleStageCleared()
    }
  }

  private addExperience(amount: number) {
    applyExperienceInPlace(this.playerState, amount)
    this.persistProgress()
  }

  private onEnemyTouchesPlayer(enemy: EnemySprite) {
    if (!this.playerState.alive) {
      return
    }

    if (this.time.now < this.playerHitCooldown) {
      return
    }

    const definition = EnemyDefinitions[enemy.enemyId]
    const damage = definition.attackDamage

    if (damage > 0) {
      this.applyDamageToPlayer(damage)
      this.player.setTintFill(0xff5a6a)
      this.time.delayedCall(120, () => this.player.clearTint())
    }

    this.playerHitCooldown = this.time.now + PLAYER_INVULNERABLE_TIME

    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y)
    const knockback = 140
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined
    body?.setVelocity(Math.cos(angle) * knockback, Math.sin(angle) * knockback)
  }

  private applyDamageToPlayer(amount: number) {
    this.playerState.hp = Math.max(0, this.playerState.hp - amount)
    this.persistProgress()

    if (this.playerState.hp <= 0) {
      this.handlePlayerDeath()
    }
  }

  private handlePlayerDeath() {
    if (!this.playerState.alive) {
      return
    }

    this.playerState.alive = false
    this.spawnTimer?.remove(false)
    this.spawnTimer = undefined
    this.attackTimer?.remove(false)
    this.attackTimer = undefined

    this.persistProgress(true)
    this.showOverlayMessage('你阵亡了', '按 R 重新开始当前关卡')
  }

  private handleStageCleared() {
    this.stageCleared = true
    this.spawnTimer?.remove(false)
    this.spawnTimer = undefined
    this.attackTimer?.remove(false)
    this.attackTimer = undefined
    this.persistProgress(true)
    this.showOverlayMessage(`关卡 ${this.stage.id} 完成`, '按 N 进入下一关')
  }

  private restartStage() {
    this.hideOverlay()
    this.playerState = createInitialPlayerState()
    this.startStage(StageDefinitions[this.stageIndex])
  }

  private advanceToNextStage() {
    if (this.stageIndex < StageDefinitions.length - 1) {
      this.stageIndex += 1
    }

    this.hideOverlay()
    this.playerState.hp = this.playerState.maxHp
    this.startStage(StageDefinitions[this.stageIndex])
  }

  private overlayBackground?: Phaser.GameObjects.Rectangle

  private overlayMessage?: Phaser.GameObjects.Text

  private showOverlayMessage(title: string, subtitle: string) {
    this.overlayBackground?.destroy()
    this.overlayMessage?.destroy()

    this.overlayBackground = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0d17, 0.65)
      .setDepth(20)

    this.overlayMessage = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `${title}\n${subtitle}`, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#f4f6ff',
        align: 'center',
      })
      .setDepth(21)
      .setOrigin(0.5)
      .setLineSpacing(12)
  }

  private hideOverlay() {
    this.overlayBackground?.destroy()
    this.overlayMessage?.destroy()
    this.overlayBackground = undefined
    this.overlayMessage = undefined
  }

  private showStageBanner(stage: StageDefinition) {
    this.stageBanner?.destroy()

    this.stageBanner = this.add
      .text(GAME_WIDTH / 2, 48, `关卡 ${stage.id}：${stage.name}`, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#9ad1ff',
      })
      .setDepth(6)
      .setOrigin(0.5)

    this.time.delayedCall(2200, () => {
      this.stageBanner?.destroy()
      this.stageBanner = undefined
    })
  }

  private setupAttackTimer() {
    this.attackTimer?.remove(false)

    const weapon = WeaponDefinitions[this.equippedWeapon]
    this.attackTimer = this.time.addEvent({
      delay: 1000 / weapon.attacksPerSecond,
      loop: true,
      callback: () => this.performWeaponAttack(),
    })
  }

  private switchWeapon(id: WeaponId) {
    if (this.equippedWeapon === id) {
      return
    }

    this.equippedWeapon = id
    this.persistProgress()

    if (this.playerState.alive && !this.stageCleared) {
      this.setupAttackTimer()
    }
  }

  private updateProjectiles(_delta: number) {
    const margin = 80

    this.projectiles.getChildren().forEach((child) => {
      const projectile = child as ProjectileSprite
      if (!projectile.active) {
        return
      }

      const expire = projectile.getData('expire') as number | undefined
      if ((expire && expire < this.time.now) || this.isOutsideBounds(projectile.x, projectile.y, margin)) {
        this.destroyProjectile(projectile)
      }
    })
  }

  private isOutsideBounds(x: number, y: number, margin: number) {
    return x < -margin || x > GAME_WIDTH + margin || y < -margin || y > GAME_HEIGHT + margin
  }

  private onProjectileHitsEnemy(projectile: ProjectileSprite, enemy: EnemySprite) {
    if (!projectile.active || !enemy.active) {
      return
    }

    const recentHits = projectile.getData('recentHits') as Set<EnemySprite> | undefined
    if (recentHits?.has(enemy)) {
      return
    }

    recentHits?.add(enemy)

    this.damageEnemy(enemy, projectile.damage)

    if (projectile.element === 'water') {
      enemy.setData('slowExpire', this.time.now + 900)
    }

    projectile.penetration -= 1
    if (projectile.penetration <= 0) {
      this.destroyProjectile(projectile)
    }
  }

  private destroyProjectile(projectile: ProjectileSprite) {
    projectile.destroy()
  }

  private updateHud() {
    const expProgress = `${Math.floor(this.playerState.exp)}/${this.playerState.nextExp}`
    const timeText = this.elapsedTime.toFixed(1)
    const enemyCount = this.enemies.countActive(true)
    const weapon = WeaponDefinitions[this.equippedWeapon]

    this.hudText.setText(
      `关卡 ${this.stage.id} | 分数 ${this.score}/${this.stage.targetScore}\n` +
        `生命 ${Math.ceil(this.playerState.hp)}/${this.playerState.maxHp} | 等级 ${this.playerState.level} (${expProgress})\n` +
        `时间 ${timeText}s | 敌人 ${enemyCount}/${ENEMY_LIMIT}\n` +
        `武器 ${weapon.label} | 伤害 ${weapon.baseDamage} | 攻速 ${weapon.attacksPerSecond.toFixed(1)}/s`,
    )
  }

  private publishDebugInfo() {
    if (typeof window === 'undefined') {
      return
    }

    const debugWindow = window as DebugWindow
    debugWindow.__MAGICZOMBIE_DEBUG__ = {
      stageId: this.stage?.id ?? null,
      score: this.score,
      player: { x: this.player.x, y: this.player.y },
      enemyCount: this.enemies.countActive(true),
      hudText: this.hudText?.text ?? '',
    }
  }
}
