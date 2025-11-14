import { jest } from '@jest/globals'
import PlayScene from '../../src/game/scenes/PlayScene'

describe('PlayScene.damageEnemy integration', () => {
  it('skips processing when the enemy sprite is already inactive', () => {
    const damageEnemy = (PlayScene.prototype as any).damageEnemy as (
      enemy: any,
      amount: number,
      source?: unknown,
    ) => boolean
    const fakeScene = {
      handleEnemyKilled: jest.fn(),
      time: { delayedCall: jest.fn() },
    }
    const enemy = {
      active: false,
      hp: 42,
      setTintFill: jest.fn(),
      clearTint: jest.fn(),
    } as any

    const killed = damageEnemy.call(fakeScene, enemy, 15, 'waterCannon')

    expect(killed).toBe(false)
    expect(enemy.hp).toBe(42)
    expect(fakeScene.handleEnemyKilled).not.toHaveBeenCalled()
    expect(fakeScene.time.delayedCall).not.toHaveBeenCalled()
  })
})
