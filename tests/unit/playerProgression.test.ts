import {
  applyExperience,
  applyExperienceInPlace,
  applyDamage,
  createInitialPlayerState,
  getNextExpRequirement,
} from '../../src/game/logic/playerProgression'

describe('playerProgression logic', () => {
  describe('getNextExpRequirement', () => {
    it('returns base requirement for level 1', () => {
      expect(getNextExpRequirement(1)).toBe(80)
    })

    it('increments experience requirement linearly per level', () => {
      expect(getNextExpRequirement(2)).toBe(120)
      expect(getNextExpRequirement(5)).toBe(80 + 4 * 40)
    })
  })

  describe('createInitialPlayerState', () => {
    it('returns default player state blueprint', () => {
      const state = createInitialPlayerState()

      expect(state).toMatchObject({
        maxHp: 100,
        hp: 100,
        speed: 220,
        level: 1,
        exp: 0,
        nextExp: 80,
        alive: true,
      })
    })

    it('returns new copies on each call', () => {
      const first = createInitialPlayerState()
      const second = createInitialPlayerState()

      expect(first).not.toBe(second)
      first.hp = 50
      expect(second.hp).toBe(100)
    })
  })

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

    it('levels up exact multiple levels with correct hp/maxHp/exp math', () => {
      // From level 1: need 80, then 120, then 160 => total 360 to reach level 4 with 0 exp
      const base = { ...baseState, hp: 50 }
      const { state, levelsGained } = applyExperience(base, 360)

      expect(levelsGained).toBe(3)
      expect(state.level).toBe(4)
      expect(state.exp).toBe(0)
      // +5 maxHp per level, +5 hp per level but not exceeding max
      expect(state.maxHp).toBe(100 + 3 * 5)
      expect(state.hp).toBe(50 + 3 * 5)
      expect(state.nextExp).toBe(80 + (4 - 1) * 40) // level 4 requirement
    })

    it('does not allow negative experience to reduce below zero', () => {
      const base = { ...baseState, exp: 10 }
      const { state } = applyExperience(base, -50)
      expect(state.exp).toBe(0)
      expect(state.level).toBe(1)
    })
  })

  describe('applyExperienceInPlace', () => {
    it('mutates the provided state reference while keeping it consistent', () => {
      const state = createInitialPlayerState()
      const result = applyExperienceInPlace(state, 160)

      expect(result.state).toBe(state)
      expect(state.level).toBe(2)
      expect(state.exp).toBe(80)
      expect(state.maxHp).toBe(105)
      expect(state.hp).toBe(105)
      expect(state.nextExp).toBe(120)
    })
  })

  describe('applyDamage', () => {
    it('reduces hp but not below zero', () => {
      const state = { maxHp: 100, hp: 10, level: 1, exp: 0, nextExp: 80 }
      const after = applyDamage(state, 25)
      expect(after.hp).toBe(0)
      // does not mutate the original object
      expect(state.hp).toBe(10)
    })
  })
})
