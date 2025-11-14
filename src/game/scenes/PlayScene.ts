import Phaser from 'phaser'

import { GAME_HEIGHT, GAME_WIDTH } from '../constants/dimensions'
import { EnemyDefinitions } from '../data/enemies'
import { StageDefinitions } from '../data/stages'
import { WeaponDefinitions } from '../data/weapons'
import type { EnemyId, StageDefinition, WeaponId } from '../data/types'
import { applyExperienceInPlace, createInitialPlayerState } from '../logic/playerProgression'
import { getSpawnInterval, pickEnemyId, resolveBatchCount } from '../logic/spawnRules'
import type { RandomFloatFn, RandomIntFn } from '../logic/spawnRules'
import { profileManager } from '../../state/profileManager'
import { telemetryTracker } from '../../services/telemetryTracker'
import { ensureWeaponSelected } from '../../ui/weaponGate'
import {
  addWeaponExperience,
  calculateWeaponExpGain,
  createInitialWeaponProgress,
  getWeaponProgressSummary,
  type WeaponProgressMap,
} from '../logic/weaponProgression'
import { WeaponEnhancementPools, type WeaponEnhancementId } from '../data/weaponEnhancements'
import { presentWeaponEnhancements } from '../../ui/weaponEnhanceGate'
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
  weaponId?: WeaponId
}

type MovementKeys = {
  up: Phaser.Input.Keyboard.Key
  down: Phaser.Input.Keyboard.Key
  left: Phaser.Input.Keyboard.Key
  right: Phaser.Input.Keyboard.Key
}

type WeaponEnhancementState = Partial<Record<WeaponEnhancementId, number>>

type DebugWindow = Window & {
  __MAGICZOMBIE_DEBUG__?: {
    stageId: number | null
    score: number
    player: { x: number; y: number }
    enemyCount: number
    hudText: string
    projectiles?: Array<{ createdAt: number; weaponId?: WeaponId; velocity: { x: number; y: number } }>
  }
}

const ENEMY_LIMIT = 60
const WEAPON_ORDER: WeaponId[] = ['lightningChain', 'flamethrower', 'waterCannon']
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

  private backgroundImage?: Phaser.GameObjects.Image

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

  private stageReady = false
  private readonly weaponLevelSyncEnabled =
    import.meta.env?.VITE_ENABLE_WEAPON_LEVEL_SYNC === 'true'
  private weaponProgress: WeaponProgressMap = createInitialWeaponProgress(WEAPON_ORDER)
  private weaponEnhancements: Record<WeaponId, WeaponEnhancementState> = {
    lightningChain: {},
    flamethrower: {},
    waterCannon: {},
  }
  private pendingEnhancements: WeaponId[] = []
  private enhancementOverlayActive = false

  create() {
    this.playerState = createInitialPlayerState()
    this.populateStateFromProfile()
    this.syncWeaponFromProfile()

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

    const initialStage = StageDefinitions[this.stageIndex] ?? StageDefinitions[0]
    this.updateBackgroundTexture(initialStage.backgroundKey)
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0d17, 0.35).setOrigin(0).setDepth(-11)

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

    void this.prepareStage(StageDefinitions[this.stageIndex])
  }

  private updateBackgroundTexture(textureKey: string) {
    if (!textureKey || !this.textures.exists(textureKey)) {
      console.warn(`Background texture "${textureKey}" is not loaded; skipping update.`)
      return
    }

    if (!this.backgroundImage) {
      this.backgroundImage = this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, textureKey)
        .setDepth(-12)
    } else {
      this.backgroundImage.setTexture(textureKey)
    }

    this.backgroundImage.setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
  }

  private populateStateFromProfile() {
    const profile = profileManager.getProfile()
    if (!profile) {
      return
    }

    this.stageIndex = Phaser.Math.Clamp(profile.stageIndex, 0, StageDefinitions.length - 1)
    Object.assign(this.playerState, profile.playerState)
    this.playerState.hp = Phaser.Math.Clamp(this.playerState.hp, 0, this.playerState.maxHp)
    this.equippedWeapon = profile.selectedWeapon ?? 'lightningChain'
  }

  private syncWeaponFromProfile() {
    const desired = profileManager.getSelectedWeapon()
    if (this.equippedWeapon !== desired) {
      this.equippedWeapon = desired
    }
  }

  private async prepareStage(stage: StageDefinition) {
    this.stageReady = false
    try {
      await ensureWeaponSelected()
    } catch (error) {
      console.error('Weapon selection failed', error)
    }
    this.startStage(stage)
    this.stageReady = true
    this.processEnhancementQueue()
  }

  update(_time: number, delta: number) {
    if (!this.playerState.alive || !this.stageReady) {
      return
    }

    if (this.stageCleared) {
      this.updateHud()
      this.publishDebugInfo()
      return
    }

    this.handlePlayerMovement()
    this.updateEnemiesAI(delta)
    this.updateProjectiles(delta)

    this.elapsedTime += delta / 1000
    this.updateHud()
    this.publishDebugInfo()
  }

  private startStage(stage: StageDefinition) {
    this.stage = stage
    this.updateBackgroundTexture(stage.backgroundKey)
    this.score = 0
    this.elapsedTime = 0
    this.stageCleared = false
    this.playerHitCooldown = 0

    this.enemies.clear(true, true)
    this.projectiles.clear(true, true)

    this.playerState.hp = this.playerState.maxHp
    this.playerState.alive = true
    this.player.clearTint()
    this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2)
    this.player.body?.reset(GAME_WIDTH / 2, GAME_HEIGHT / 2)

    this.scheduleNextSpawn(true)
    this.syncWeaponFromProfile()
    this.setupAttackTimer()

    this.showStageBanner(stage)
    this.beginTelemetryRun(stage)
  }

  private beginTelemetryRun(stage: StageDefinition) {
    const playerId = profileManager.getProfile()?.id ?? null
    telemetryTracker.beginRun({
      playerId,
      stage,
      selectedWeapon: this.equippedWeapon,
    })
    this.publishTelemetrySnapshot()
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
      const speedMultiplier = this.getMovementSpeedMultiplier()
      const speed = this.playerState.speed * speedMultiplier
      this.player.setVelocity(direction.x * speed, direction.y * speed)
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
      const freezeUntil = enemy.getData('freezeUntil') as number | undefined
      if (freezeUntil && freezeUntil > this.time.now) {
        enemy.setVelocity(0, 0)
        enemy.setAngularVelocity(0)
        return
      }
      if (freezeUntil && freezeUntil <= this.time.now) {
        enemy.setData('freezeUntil', undefined)
        enemy.clearTint()
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
    if (!this.playerState.alive || this.stageCleared) {
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
    const stats = this.getLightningStats()
    const enemies = this.getEnemiesInRange(stats.range)

    if (enemies.length === 0) {
      return
    }

    let sourceX = this.player.x
    let sourceY = this.player.y

    const targets = enemies.slice(0, stats.chainTargets)
    targets.forEach((enemy) => {
      this.drawLightning(sourceX, sourceY, enemy.x, enemy.y)
      let damage = stats.damage
      if (stats.critChance > 0 && Math.random() < stats.critChance) {
        damage *= 2
      }
      this.damageEnemy(enemy, damage, 'lightningChain')
      if (stats.overloadStacks > 0) {
        this.spawnLightningOverloadField(enemy.x, enemy.y, damage, stats.overloadStacks)
      }
      sourceX = enemy.x
      sourceY = enemy.y
    })
  }

  private performFlamethrower() {
    const stats = this.getFlamethrowerStats()
    const targets = this.getEnemiesInRange(stats.range)

    if (targets.length === 0) {
      return
    }

    const primary = targets[0]
    const direction = new Phaser.Math.Vector2(primary.x - this.player.x, primary.y - this.player.y)
    if (direction.lengthSq() === 0) {
      direction.set(1, 0)
    }
    direction.normalize()

    const coneTargets = this.getEnemiesWithinCone(stats.range, direction, Phaser.Math.DegToRad(50))
    const maxHits = Math.min(6 + stats.extraTargets, coneTargets.length)
    coneTargets.slice(0, maxHits).forEach((enemy) => {
      this.damageEnemy(enemy, stats.damage, 'flamethrower')
      this.applyFlamethrowerBurn(enemy, stats.damage, stats.burnStacks)
    })

    this.drawFlamethrowerCone(direction, stats.range)
  }

  private performWaterCannon() {
    const stats = this.getWaterCannonStats()
    const target = this.getNearestEnemy()

    const direction = new Phaser.Math.Vector2(
      target ? target.x - this.player.x : 1,
      target ? target.y - this.player.y : 0,
    )
    if (direction.lengthSq() === 0) {
      direction.set(1, 0)
    }
    direction.normalize()

    const projectile = this.physics.add.sprite(this.player.x, this.player.y, 'projectile-water') as ProjectileSprite
    const body = projectile.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false)
    body.setImmovable(false)
    body.setDrag(0, 0)
    body.useDamping = false
    projectile.damage = stats.damage
    projectile.penetration = Number.POSITIVE_INFINITY
    projectile.element = 'water'
    projectile.weaponId = 'waterCannon'
    projectile.setDepth(3)
    projectile.setRotation(direction.angle() + Math.PI / 2)
    projectile.setVelocity(0, 0)
    projectile.setData('expire', undefined)
    projectile.setData('recentHits', new Set<EnemySprite>())
    projectile.setData('burstStacks', stats.burstStacks)
    projectile.setData('freezeChance', stats.freezeChance)
    projectile.setData('freezeStacks', stats.freezeStacks)
    projectile.setData('rippleStacks', stats.rippleStacks)
    const velocity = new Phaser.Math.Vector2(direction.x * stats.projectileSpeed, direction.y * stats.projectileSpeed)
    projectile.setData('velocity', velocity)

    this.projectiles.add(projectile)
    this.registerProjectileDebug(projectile)
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

  private getNearestEnemy() {
    const list = this.enemies.getChildren() as EnemySprite[]
    let closest: EnemySprite | undefined
    let minDistance = Number.POSITIVE_INFINITY
    list.forEach((enemy) => {
      if (!enemy.active) {
        return
      }
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y)
      if (distance < minDistance) {
        minDistance = distance
        closest = enemy
      }
    })
    return closest
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

  private drawLightning(startX: number, startY: number, endX: number, endY: number) {
    const graphics = this.add.graphics()
    graphics.setDepth(4)
    graphics.lineStyle(3, 0xe6ff69, 0.9)

    const jaggedPoints = 4
    const points = [{ x: startX, y: startY }]
    for (let i = 1; i < jaggedPoints; i += 1) {
      const t = i / jaggedPoints
      const point = Phaser.Math.Interpolation.Linear([startX, endX], t)
      const pointY = Phaser.Math.Interpolation.Linear([startY, endY], t)
      const offsetX = Phaser.Math.Between(-12, 12)
      const offsetY = Phaser.Math.Between(-12, 12)
      points.push({ x: point + offsetX, y: pointY + offsetY })
    }
    points.push({ x: endX, y: endY })

    graphics.beginPath()
    graphics.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i += 1) {
      graphics.lineTo(points[i].x, points[i].y)
    }
    graphics.strokePath()

    this.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 120,
      onComplete: () => graphics.destroy(),
    })
  }

  private drawFlamethrowerCone(direction: Phaser.Math.Vector2, range: number) {
    const graphics = this.add.graphics()
    graphics.setDepth(3)
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

  private damageEnemy(enemy: EnemySprite, amount: number, sourceWeapon?: WeaponId): boolean {
    if (!enemy.active) {
      return false
    }

    enemy.hp -= amount
    if (enemy.hp <= 0) {
      this.handleEnemyKilled(enemy, sourceWeapon)
      return true
    } else {
      enemy.setTintFill(0xffffcc)
      this.time.delayedCall(80, () => {
        enemy.clearTint()
      })
    }
    return false
  }

  private handleEnemyKilled(enemy: EnemySprite, sourceWeapon?: WeaponId) {
    const definition = EnemyDefinitions[enemy.enemyId]
    this.addScore(definition.score)
    this.addExperience(definition.experience)
    this.addWeaponExperienceFromKill(sourceWeapon ?? this.equippedWeapon, enemy.enemyId)
    telemetryTracker.recordKill(enemy.enemyId)

    enemy.disableBody(true, true)
    enemy.destroy()
  }

  private addScore(amount: number) {
    this.score += amount
    if (this.score >= this.stage.targetScore && !this.stageCleared) {
      this.handleStageCleared()
    }
  }

  private addExperience(amount: number) {
    applyExperienceInPlace(this.playerState, amount)
  }

  private addWeaponExperienceFromKill(weaponId: WeaponId | undefined, enemyId: EnemyId) {
    if (!weaponId) {
      return
    }
    const gain = calculateWeaponExpGain(enemyId)
    const levels = addWeaponExperience(this.weaponProgress, weaponId, gain)
    if (levels > 0) {
      this.enqueueWeaponEnhancements(weaponId, levels)
      this.syncWeaponLevelsFrom(weaponId)
    }
  }

  private syncWeaponLevelsFrom(sourceWeaponId: WeaponId) {
    if (!this.weaponLevelSyncEnabled) {
      return
    }
    const source = this.weaponProgress[sourceWeaponId]
    if (!source) {
      return
    }

    for (const weaponId of WEAPON_ORDER) {
      if (weaponId === sourceWeaponId) {
        continue
      }
      const target = this.weaponProgress[weaponId]
      if (!target) {
        continue
      }
      const previousLevel = target.level
      if (previousLevel >= source.level) {
        continue
      }
      const gainedLevels = source.level - previousLevel
      target.level = source.level
      target.exp = source.exp
      this.enqueueWeaponEnhancements(weaponId, gainedLevels)
    }
  }

  private enqueueWeaponEnhancements(weaponId: WeaponId, count: number) {
    for (let i = 0; i < count; i += 1) {
      this.pendingEnhancements.push(weaponId)
    }
    this.processEnhancementQueue()
  }

  private processEnhancementQueue() {
    if (this.enhancementOverlayActive) {
      return
    }
    if (this.pendingEnhancements.length === 0) {
      return
    }
    if (!this.stageReady || !this.playerState.alive) {
      return
    }
    const weaponId = this.pendingEnhancements.shift()
    if (!weaponId) {
      return
    }
    this.enhancementOverlayActive = true
    this.pauseCombatForOverlay()
    void this.openEnhancementSelection(weaponId)
  }

  private async openEnhancementSelection(weaponId: WeaponId) {
    const weapon = WeaponDefinitions[weaponId]
    const choices = this.pickEnhancementChoices(weaponId)
    if (choices.length === 0) {
      this.enhancementOverlayActive = false
      this.resumeCombatAfterOverlay()
      return
    }
    const selection = await presentWeaponEnhancements(weapon.label, choices)
    if (selection) {
      this.incrementEnhancement(weaponId, selection)
    }
    this.enhancementOverlayActive = false
    this.resumeCombatAfterOverlay()
    this.processEnhancementQueue()
  }

  private pickEnhancementChoices(weaponId: WeaponId) {
    const pool = WeaponEnhancementPools[weaponId]
    const stacks = this.weaponEnhancements[weaponId] ?? {}
    const available = pool.filter((def) => (stacks[def.id] ?? 0) < def.maxStacks)
    const candidates = available.length >= 3 ? available : pool
    const shuffled = [...candidates].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, Math.min(3, shuffled.length))
    return selected.map((def) => {
      const stack = stacks[def.id] ?? 0
      return {
        id: def.id,
        weaponId,
        name: def.name,
        description: def.description,
        stacks: stack,
        maxStacks: def.maxStacks,
        disabled: stack >= def.maxStacks,
      }
    })
  }

  private incrementEnhancement(weaponId: WeaponId, enhancementId: WeaponEnhancementId) {
    const pool = WeaponEnhancementPools[weaponId]
    const definition = pool.find((item) => item.id === enhancementId)
    if (!definition) {
      return
    }
    const stacks = this.getEnhancementStack(weaponId, enhancementId)
    if (stacks >= definition.maxStacks) {
      return
    }
    const bucket = this.weaponEnhancements[weaponId] ?? {}
    bucket[enhancementId] = stacks + 1
    this.weaponEnhancements[weaponId] = bucket
    if (weaponId === this.equippedWeapon) {
      this.setupAttackTimer()
    }
  }

  private getEnhancementStack(weaponId: WeaponId, enhancementId: WeaponEnhancementId) {
    return this.weaponEnhancements[weaponId]?.[enhancementId] ?? 0
  }

  private pauseCombatForOverlay() {
    this.stageReady = false
    this.player.setVelocity(0, 0)
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as EnemySprite
      enemy.setVelocity(0, 0)
      enemy.setAngularVelocity(0)
    })
    if (this.spawnTimer) {
      this.spawnTimer.paused = true
    }
    if (this.attackTimer) {
      this.attackTimer.paused = true
    }
  }

  private resumeCombatAfterOverlay() {
    if (!this.playerState.alive) {
      return
    }
    this.stageReady = true
    if (this.spawnTimer) {
      this.spawnTimer.paused = false
    }
    if (this.attackTimer) {
      this.attackTimer.paused = false
    }
    this.processEnhancementQueue()
  }

  private resetWeaponSystems() {
    this.weaponProgress = createInitialWeaponProgress(WEAPON_ORDER)
    this.weaponEnhancements = {
      lightningChain: {},
      flamethrower: {},
      waterCannon: {},
    }
    this.pendingEnhancements = []
    this.enhancementOverlayActive = false
  }

  private onEnemyTouchesPlayer(enemy: EnemySprite) {
    if (!this.playerState.alive || this.stageCleared) {
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
    this.freezeEnemies()
    this.resetWeaponSystems()

    this.publishTelemetrySnapshot()
    telemetryTracker.markFailed()
    this.showOverlayMessage('你阵亡了', '按 R 重新开始当前关卡')
  }

  private handleStageCleared() {
    this.stageCleared = true
    this.spawnTimer?.remove(false)
    this.spawnTimer = undefined
    this.attackTimer?.remove(false)
    this.attackTimer = undefined
    this.freezeEnemies()
    this.publishTelemetrySnapshot()
    telemetryTracker.markCleared()
    this.showOverlayMessage(`关卡 ${this.stage.id} 完成`, '按 N 进入下一关')
  }

  private freezeEnemies() {
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as EnemySprite
      enemy.setVelocity(0, 0)
      enemy.setAngularVelocity(0)
    })
  }

  private restartStage() {
    this.hideOverlay()
    this.playerState = createInitialPlayerState()
    this.stageIndex = 0
    this.score = 0
    this.elapsedTime = 0
    this.stageCleared = false
    this.resetWeaponSystems()
    void this.prepareStage(StageDefinitions[this.stageIndex])
  }

  private advanceToNextStage() {
    if (this.stageIndex < StageDefinitions.length - 1) {
      this.stageIndex += 1
    }

    this.hideOverlay()
    this.playerState.hp = this.playerState.maxHp
    void this.prepareStage(StageDefinitions[this.stageIndex])
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

    const attacksPerSecond = this.getAttackRateForWeapon(this.equippedWeapon)
    this.attackTimer = this.time.addEvent({
      delay: 1000 / attacksPerSecond,
      loop: true,
      callback: () => this.performWeaponAttack(),
    })
  }

  private switchWeapon(id: WeaponId) {
    if (this.enhancementOverlayActive) {
      return
    }
    if (this.equippedWeapon === id) {
      return
    }

    this.equippedWeapon = id
    profileManager.setSelectedWeapon(id)

    if (this.playerState.alive && !this.stageCleared) {
      this.setupAttackTimer()
    }
  }

  private updateProjectiles(delta: number) {
    const margin = 80

    this.projectiles.getChildren().forEach((child) => {
      const projectile = child as ProjectileSprite
      if (!projectile.active) {
        return
      }
      const velocity = projectile.getData('velocity') as Phaser.Math.Vector2 | undefined
      if (velocity) {
        projectile.x += velocity.x * (delta / 1000)
        projectile.y += velocity.y * (delta / 1000)
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

    const killed = this.damageEnemy(enemy, projectile.damage, projectile.weaponId)

    const rippleStacks = projectile.getData('rippleStacks') as number | undefined
    if (!killed && rippleStacks && rippleStacks > 0) {
      this.damageEnemy(enemy, projectile.damage * 0.15 * rippleStacks, 'waterCannon')
    }

    const freezeChance = projectile.getData('freezeChance') as number | undefined
    if (freezeChance && Math.random() < freezeChance) {
      const freezeStacks = (projectile.getData('freezeStacks') as number | undefined) ?? 1
      this.applyFreeze(enemy, freezeStacks)
    }

    if (projectile.element === 'water') {
      enemy.setData('slowExpire', this.time.now + 900)
    }

    if (Number.isFinite(projectile.penetration)) {
      projectile.penetration -= 1
      if (projectile.penetration <= 0) {
        this.destroyProjectile(projectile)
      }
    }
  }

  private destroyProjectile(projectile: ProjectileSprite) {
    if (projectile.element === 'water') {
      const burstStacks = projectile.getData('burstStacks') as number | undefined
      if (burstStacks && burstStacks > 0) {
        this.spawnWaterBurst(projectile.x, projectile.y, projectile.damage * 0.5, burstStacks)
      }
    }
    projectile.destroy()
  }

  private registerProjectileDebug(projectile: ProjectileSprite) {
    if (typeof window === 'undefined') {
      return
    }
    const debugWindow = window as DebugWindow
    if (!debugWindow.__MAGICZOMBIE_DEBUG__) {
      debugWindow.__MAGICZOMBIE_DEBUG__ = {
        stageId: null,
        score: 0,
        player: { x: 0, y: 0 },
        enemyCount: 0,
        hudText: '',
        projectiles: [],
      }
    }
    const store = debugWindow.__MAGICZOMBIE_DEBUG__!
    store.projectiles = store.projectiles ?? []
    const velocity = projectile.getData('velocity') as Phaser.Math.Vector2 | undefined
    store.projectiles.push({
      createdAt: this.time.now,
      weaponId: projectile.weaponId,
      velocity: velocity ? { x: velocity.x, y: velocity.y } : { x: 0, y: 0 },
    })
    if (store.projectiles.length > 20) {
      store.projectiles.shift()
    }
  }

  private getMovementSpeedMultiplier() {
    if (this.equippedWeapon === 'flamethrower') {
      return 1 + 0.1 * this.getEnhancementStack('flamethrower', 'flame_speed')
    }
    return 1
  }

  private getAttackRateForWeapon(weaponId: WeaponId) {
    const base = WeaponDefinitions[weaponId].attacksPerSecond
    if (weaponId === 'lightningChain') {
      const stacks = this.getEnhancementStack('lightningChain', 'chain_speed')
      return base * (1 + 0.15 * stacks)
    }
    return base
  }

  private getFlamethrowerStats() {
    const base = WeaponDefinitions.flamethrower
    const rangeMultiplier = 1 + 0.2 * this.getEnhancementStack('flamethrower', 'flame_range')
    const damageMultiplier = 1 + 0.3 * this.getEnhancementStack('flamethrower', 'flame_heat')
    const extraTargets = this.getEnhancementStack('flamethrower', 'flame_density') * 2
    const burnStacks = this.getEnhancementStack('flamethrower', 'flame_burn')
    return {
      range: base.range * rangeMultiplier,
      damage: base.baseDamage * damageMultiplier,
      extraTargets,
      burnStacks,
    }
  }

  private getWaterCannonStats() {
    const base = WeaponDefinitions.waterCannon
    const velocityStacks = this.getEnhancementStack('waterCannon', 'water_velocity')
    const damageStacks = this.getEnhancementStack('waterCannon', 'water_damage')
    const burstStacks = this.getEnhancementStack('waterCannon', 'water_burst')
    const freezeStacks = this.getEnhancementStack('waterCannon', 'water_freeze')
    const rippleStacks = this.getEnhancementStack('waterCannon', 'water_ripple')
    const speedMultiplier = 1 + 0.25 * velocityStacks
    return {
      damage: base.baseDamage * (1 + 0.2 * damageStacks),
      projectileSpeed: (base.projectileSpeed ?? 520) * speedMultiplier,
      burstStacks,
      freezeChance: Math.min(0.8, 0.06 * freezeStacks),
      freezeStacks,
      rippleStacks,
    }
  }

  private getLightningStats() {
    const base = WeaponDefinitions.lightningChain
    const jumpStacks = this.getEnhancementStack('lightningChain', 'chain_jump')
    const rangeStacks = this.getEnhancementStack('lightningChain', 'chain_range')
    const overloadStacks = this.getEnhancementStack('lightningChain', 'chain_overload')
    const critStacks = this.getEnhancementStack('lightningChain', 'chain_crit')
    const speedStacks = this.getEnhancementStack('lightningChain', 'chain_speed')
    const damageMultiplier = Math.max(0.2, 1 - 0.1 * speedStacks)
    return {
      damage: base.baseDamage * damageMultiplier,
      range: base.range * (1 + 0.2 * rangeStacks),
      chainTargets: (base.chainTargets ?? 3) + jumpStacks * 2,
      overloadStacks,
      critChance: Math.min(0.9, 0.1 * critStacks),
      attacksPerSecond: base.attacksPerSecond * (1 + 0.15 * speedStacks),
    }
  }

  private applyFlamethrowerBurn(enemy: EnemySprite, damage: number, stacks: number) {
    if (stacks <= 0) {
      return
    }
    const tickDamage = damage * 0.5
    for (let i = 1; i <= stacks; i += 1) {
      this.time.delayedCall(1000 * i, () => {
        if (!enemy.active || this.stageCleared) {
          return
        }
        this.damageEnemy(enemy, tickDamage, 'flamethrower')
      })
    }
  }

  private spawnWaterBurst(x: number, y: number, damage: number, stacks: number) {
    if (stacks <= 0) {
      return
    }
    const radius = 80 + stacks * 10
    const enemies = this.enemies.getChildren() as EnemySprite[]
    enemies.forEach((enemy) => {
      if (!enemy.active) {
        return
      }
      const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y)
      if (distance <= radius) {
        this.damageEnemy(enemy, damage, 'waterCannon')
        enemy.setData('slowExpire', this.time.now + 600)
      }
    })
    const gfx = this.add.circle(x, y, radius, 0x99d4ff, 0.25).setDepth(2)
    this.tweens.add({ targets: gfx, alpha: 0, duration: 250, onComplete: () => gfx.destroy() })
  }

  private applyFreeze(enemy: EnemySprite, stacks: number) {
    if (stacks <= 0) {
      return
    }
    enemy.setData('freezeUntil', this.time.now + 600 + stacks * 200)
    enemy.setTintFill(0xc7f0ff)
    this.time.delayedCall(600 + stacks * 200, () => {
      enemy.clearTint()
    })
  }

  private spawnLightningOverloadField(x: number, y: number, damage: number, stacks: number) {
    if (stacks <= 0) {
      return
    }
    const radius = 70 + stacks * 12
    const pulses = 4 + stacks
    const interval = 250
    const gfx = this.add.circle(x, y, radius, 0x8fe4ff, 0.25).setDepth(2)
    let count = 0
    this.time.addEvent({
      delay: interval,
      repeat: pulses,
      callback: () => {
        const enemies = this.enemies.getChildren() as EnemySprite[]
        enemies.forEach((enemy) => {
          if (!enemy.active) {
            return
          }
          const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y)
          if (distance <= radius) {
            this.damageEnemy(enemy, damage * 0.3, 'lightningChain')
          }
        })
        count += 1
        if (count > pulses) {
          gfx.destroy()
        }
      },
    })
  }
  private updateHud() {
    const expProgress = `${Math.floor(this.playerState.exp)}/${this.playerState.nextExp}`
    const timeText = this.elapsedTime.toFixed(1)
    const weapon = WeaponDefinitions[this.equippedWeapon]

    const weaponProgressText = this.buildWeaponProgressLines()

    this.hudText.setText(
      `关卡 ${this.stage.id} | 分数 ${this.score}/${this.stage.targetScore}\n` +
        `生命 ${Math.ceil(this.playerState.hp)}/${this.playerState.maxHp} | 等级 ${this.playerState.level} (${expProgress})\n` +
        `时间 ${timeText}s\n` +
        `武器 ${weapon.label} | 伤害 ${weapon.baseDamage} | 攻速 ${weapon.attacksPerSecond.toFixed(1)}/s\n` +
        `${weaponProgressText}`,
    )

    profileManager.updateSnapshot({
      stageIndex: this.stageIndex,
      score: this.score,
      playerState: this.playerState,
    })

    this.publishTelemetrySnapshot()
  }

  private buildWeaponProgressLines() {
    const weaponId = this.equippedWeapon
    const weapon = WeaponDefinitions[weaponId]
    const summary = getWeaponProgressSummary(this.weaponProgress, weaponId)
    if (summary.max) {
      return `${weapon.label} Lv${summary.level} (MAX)`
    }
    return `${weapon.label} Lv${summary.level} (${summary.exp}/${summary.next})`
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
      projectiles: debugWindow.__MAGICZOMBIE_DEBUG__?.projectiles ?? [],
    }
  }

  private publishTelemetrySnapshot() {
    telemetryTracker.updateSnapshot({
      score: this.score,
      elapsedSeconds: this.elapsedTime,
      playerState: this.playerState,
      weaponProgress: this.weaponProgress,
      weaponEnhancements: this.weaponEnhancements,
      selectedWeapon: this.equippedWeapon,
    })
  }
}
