import { applyExperience } from '../../src/game/logic/playerProgression'

describe('applyExperience', () => {
  const baseState = {
    maxHp: 100,
    hp: 90,
    level: 1,
    exp: 0,
    nextExp: 80,
  }

  it('adds experience without leveling up when below threshold', () => {
    const { state, levelsGained } = applyExperience(baseState, 30)

    expect(levelsGained).toBe(0)
    expect(state.exp).toBe(30)
    expect(state.level).toBe(1)
    expect(state.maxHp).toBe(100)
    expect(state.hp).toBe(90)
    expect(state.nextExp).toBe(80)
  })

  it('levels up once when enough experience is gained', () => {
    const { state, levelsGained } = applyExperience(baseState, 100)

    expect(levelsGained).toBe(1)
    expect(state.level).toBe(2)
    expect(state.exp).toBe(20) // 100 - 80
    expect(state.maxHp).toBe(105)
    expect(state.hp).toBe(95)
    expect(state.nextExp).toBe(120)
  })

  it('handles multiple level ups and caps hp at the new max hp', () => {
    const depletedState = { ...baseState, hp: 104, maxHp: 110, level: 3, nextExp: 160 }

    const { state, levelsGained } = applyExperience(depletedState, 400)

    expect(levelsGained).toBeGreaterThanOrEqual(1)
    expect(state.level).toBe(depletedState.level + levelsGained)
    expect(state.hp).toBeLessThanOrEqual(state.maxHp)
  })
})

